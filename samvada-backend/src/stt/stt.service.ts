import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface STTResult {
  text: string;
  language: string; // always 'kn' | 'hi' | 'en'
  confidence: number;
}

type SupportedLang = 'kn' | 'hi' | 'en';

// ─── Script validation ────────────────────────────────────────────────────────
const SCRIPT = {
  kannada:    /[\u0C80-\u0CFF]/,
  devanagari: /[\u0900-\u097F]/,
  telugu:     /[\u0C00-\u0C7F]/,
  tamil:      /[\u0B80-\u0BFF]/,
  arabic:     /[\u0600-\u06FF]/,
  malayalam:  /[\u0D00-\u0D7F]/,
  cyrillic:   /[\u0400-\u04FF]/,
  korean:     /[\uAC00-\uD7AF]/,
  japanese:   /[\u3040-\u30FF]/,
  chinese:    /[\u4E00-\u9FFF]/,
  greek:      /[\u0370-\u03FF]/,
};

function isHallucinated(text: string, lang: SupportedLang): boolean {
  if (!text?.trim()) return false;
  // Universal garbage scripts — never valid in any of our 3 languages
  if (SCRIPT.cyrillic.test(text) || SCRIPT.korean.test(text) ||
      SCRIPT.japanese.test(text) || SCRIPT.chinese.test(text) ||
      SCRIPT.greek.test(text)) return true;

  switch (lang) {
    case 'kn':
      return SCRIPT.telugu.test(text) || SCRIPT.tamil.test(text) ||
             SCRIPT.arabic.test(text) || SCRIPT.malayalam.test(text) ||
             SCRIPT.devanagari.test(text);
    case 'hi':
      return SCRIPT.arabic.test(text) || SCRIPT.telugu.test(text) ||
             SCRIPT.tamil.test(text)  || SCRIPT.kannada.test(text) ||
             SCRIPT.malayalam.test(text);
    case 'en':
      return SCRIPT.kannada.test(text) || SCRIPT.devanagari.test(text) ||
             SCRIPT.telugu.test(text)  || SCRIPT.tamil.test(text) ||
             SCRIPT.arabic.test(text)  || SCRIPT.malayalam.test(text);
  }
}

function normalizeSupported(lang: string): SupportedLang | null {
  const l = (lang || '').toLowerCase().trim();
  if (l === 'kn' || l === 'kannada') return 'kn';
  if (l === 'hi' || l === 'hindi')   return 'hi';
  if (l === 'en' || l === 'english') return 'en';
  return null;
}

function avgLogprob(result: any): number {
  const segs: any[] = result?.segments || [];
  if (!segs.length) return -1.5;
  return segs.reduce((s: number, seg: any) => s + (seg.avg_logprob ?? -1), 0) / segs.length;
}

// Languages Whisper commonly confuses with Kannada/Hindi
// Maps detected lang → best supported fallback for re-transcription
const FALLBACK: Record<string, SupportedLang> = {
  te: 'kn', telugu: 'kn',
  ta: 'kn', tamil: 'kn',
  ml: 'kn', malayalam: 'kn',
  ur: 'hi', urdu: 'hi',
  mr: 'hi', marathi: 'hi',
};

@Injectable()
export class SttService {
  private readonly logger = new Logger(SttService.name);
  private groq: Groq;

  constructor(private config: ConfigService) {
    this.groq = new Groq({ apiKey: this.config.get<string>('GROQ_API_KEY') });
  }

  async transcribe(audioBuffer: Buffer, mimeType = 'audio/webm'): Promise<STTResult> {
    const ext = mimeType.includes('wav') ? 'wav'
              : mimeType.includes('mp4') ? 'mp4'
              : 'webm';

    const tmpPath = path.join(
      os.tmpdir(),
      `samvada_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`,
    );

    try {
      fs.writeFileSync(tmpPath, audioBuffer);

      // ── Pass 1: auto-detect (1 Whisper call — fast path) ─────────────
      // whisper-large-v3-turbo is faster than large-v3 with same accuracy
      const pass1 = await this.groq.audio.transcriptions.create({
        file: fs.createReadStream(tmpPath),
        model: 'whisper-large-v3-turbo',
        response_format: 'verbose_json',
        // No language hint — let Whisper detect freely
      });

      const detectedRaw = ((pass1 as any).language || 'en').toLowerCase().trim();
      const text1       = pass1.text?.trim() || '';
      const lp1         = avgLogprob(pass1);

      this.logger.log(`STT pass-1: lang="${detectedRaw}" lp=${lp1.toFixed(3)} — "${text1.slice(0, 60)}"`);

      // ── Check 1: is it a directly supported language? ─────────────────
      const normalized = normalizeSupported(detectedRaw);

      if (normalized) {
        // Whisper detected a supported language.
        // Validate the script — Whisper sometimes outputs the wrong script
        // even when it correctly identifies the language (e.g. "kannada" → Telugu chars).
        if (!isHallucinated(text1, normalized) && text1.length > 0) {
          this.logger.log(`STT done (pass-1 clean): ${normalized}`);
          return {
            text: text1,
            language: normalized,
            confidence: Math.min(0.95, Math.max(0.5, 1 + lp1)),
          };
        }

        // Script mismatch — re-run with explicit language hint (pass 2)
        this.logger.warn(`STT pass-1 script mismatch for "${normalized}" — re-transcribing`);
        const pass2 = await this.groq.audio.transcriptions.create({
          file: fs.createReadStream(tmpPath),
          model: 'whisper-large-v3-turbo',
          response_format: 'verbose_json',
          language: normalized,
        });
        const text2 = pass2.text?.trim() || '';
        this.logger.log(`STT done (pass-2 script-fix ${normalized}): "${text2.slice(0, 60)}"`);
        return {
          text: text2,
          language: normalized,
          confidence: text2.length > 0 ? 0.85 : 0.1,
        };
      }

      // ── Check 2: unsupported language detected ────────────────────────
      // Map to the closest supported language and re-transcribe.
      const fallbackLang: SupportedLang = FALLBACK[detectedRaw] ?? 'en';
      this.logger.warn(`STT unsupported lang "${detectedRaw}" → re-transcribing as ${fallbackLang}`);

      const pass2 = await this.groq.audio.transcriptions.create({
        file: fs.createReadStream(tmpPath),
        model: 'whisper-large-v3-turbo',
        response_format: 'verbose_json',
        language: fallbackLang,
      });
      const text2 = pass2.text?.trim() || '';
      this.logger.log(`STT done (pass-2 fallback ${fallbackLang}): "${text2.slice(0, 60)}"`);
      return {
        text: text2,
        language: fallbackLang,
        confidence: text2.length > 0 ? 0.8 : 0.1,
      };

    } catch (error) {
      this.logger.error('STT failed:', error.message);
      throw new Error(`STT_FAILURE: ${error.message}`);
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  }

  async translateToEnglish(text: string, sourceLang: string): Promise<string> {
    if (sourceLang === 'en') return text;
    try {
      const response = await this.groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: 'Translate the given text to English. Return ONLY the translated text, nothing else.',
          },
          {
            role: 'user',
            content: `Translate from ${sourceLang === 'kn' ? 'Kannada' : 'Hindi'} to English: "${text}"`,
          },
        ],
        temperature: 0.1,
        max_tokens: 300,
      });
      return response.choices[0]?.message?.content?.trim() || text;
    } catch (error) {
      this.logger.error('Translation failed:', error.message);
      return text;
    }
  }
}
