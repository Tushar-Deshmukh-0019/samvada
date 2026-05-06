import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { NlpResult } from '../nlp/nlp.service';
import { EmotionResult } from '../emotion/emotion.service';
import { VerificationResult } from '../verification/verification.service';
import { PriorityResult } from '../priority/priority.service';
import * as googleTTS from 'google-tts-api';
import axios from 'axios';

export interface ResponseResult {
  text: string;
  audioBuffer?: Buffer;
  audioMimeType?: string;
  language: string;
}

@Injectable()
export class ResponseService {
  private readonly logger = new Logger(ResponseService.name);
  private groq: Groq;

  constructor(private config: ConfigService) {
    this.groq = new Groq({ apiKey: this.config.get<string>('GROQ_API_KEY') });
  }

  /**
   * Generate the appropriate text response for the current pipeline decision,
   * then convert it to speech.
   */
  async generate(
    nlpResult: NlpResult,
    emotionResult: EmotionResult,
    verificationResult: VerificationResult,
    priorityResult: PriorityResult,
    language: string,
  ): Promise<ResponseResult> {
    try {
      let responseText: string;

      if (verificationResult.decision === 'critical-escalate') {
        responseText = await this.generateShortResponse(
          'critical emergency — help is being dispatched',
          language,
        );
      } else if (verificationResult.decision === 'escalate') {
        responseText = await this.generateShortResponse(
          'connecting to a human agent now',
          language,
        );
      } else {
        // 'proceed' or 're-verify' — use the confirmation question from verification
        responseText = verificationResult.confirmationQuestion;
      }

      const tts = await this.textToSpeech(responseText, language);
      return { text: responseText, audioBuffer: tts?.buffer, audioMimeType: tts?.mimeType, language };
    } catch (error) {
      this.logger.error('Response generation failed:', error.message);
      const fallback = await this.generateShortResponse('please hold, connecting agent', language);
      return { text: fallback, language };
    }
  }

  /**
   * Ask the LLM to produce a very short (≤5 words) response in the target language
   * for a given situation description.
   */
  async generateShortResponse(situation: string, language: string): Promise<string> {
    const langName = this.langName(language);
    try {
      const response = await this.groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',   // tiny task — 8b is more than enough
        messages: [
          {
            role: 'system',
            content: `You are a 1092 government helpline assistant.
Respond ONLY in ${langName}. Write one short, grammatically correct sentence — calm and reassuring.
Keep it brief (under 8 words) but never drop words that make it sound broken or unnatural.
Good: "Help is on the way." Bad: "Help coming."`,
          },
          {
            role: 'user',
            content: `Situation: ${situation}. Give a short, grammatically correct ${langName} response (under 8 words).`,
          },
        ],
        temperature: 0.3,
        max_tokens: 40,
      });
      return response.choices[0]?.message?.content?.trim() || this.staticFallback(situation, language);
    } catch {
      return this.staticFallback(situation, language);
    }
  }

  /**
   * Last-resort static fallbacks — only used when the LLM itself fails.
   * These are intentionally minimal.
   */
  private staticFallback(situation: string, language: string): string {
    if (situation.includes('critical') || situation.includes('emergency')) {
      return language === 'kn' ? 'ಸಹಾಯ ಬರುತ್ತಿದೆ.' : language === 'hi' ? 'मदद आ रही है।' : 'Help is coming.';
    }
    return language === 'kn' ? 'ಏಜೆಂಟ್ ಸೇರುತ್ತಿದ್ದಾರೆ.' : language === 'hi' ? 'एजेंट जुड़ रहे हैं।' : 'Agent joining.';
  }

  private langName(code: string): string {
    const map: Record<string, string> = {
      kn: 'Kannada',
      hi: 'Hindi',
      en: 'English',
    };
    return map[code] ?? 'English';
  }

  // ── TTS: Groq Orpheus (English) + Google Translate TTS (Hindi/Kannada) ───
  async textToSpeech(text: string, language: string): Promise<{ buffer: Buffer; mimeType: string } | undefined> {
    const lang = language?.toLowerCase().trim();
    this.logger.log(`TTS requested | lang: "${lang}" | text: "${text.slice(0, 40)}..."`);
    try {
      if (lang === 'hi' || lang === 'hindi') {
        const buffer = await this.googleTranslateTTS(text, 'hi');
        return buffer ? { buffer, mimeType: 'audio/mpeg' } : undefined;
      }
      if (lang === 'kn' || lang === 'kannada') {
        const buffer = await this.googleTranslateTTS(text, 'kn');
        return buffer ? { buffer, mimeType: 'audio/mpeg' } : undefined;
      }
      // English (and any unrecognised language) → Groq Orpheus
      try {
        const buffer = await this.groqTTS(text);
        return buffer ? { buffer, mimeType: 'audio/wav' } : undefined;
      } catch (groqErr) {
        this.logger.warn(`Groq Orpheus unavailable (${groqErr.message}), falling back to Google TTS`);
        const buffer = await this.googleTranslateTTS(text, 'en');
        return buffer ? { buffer, mimeType: 'audio/mpeg' } : undefined;
      }
    } catch (error) {
      this.logger.error('TTS failed:', error.message);
      return undefined;
    }
  }

  // ── Groq Orpheus TTS (English) ────────────────────────────────────────────
  private async groqTTS(text: string): Promise<Buffer | undefined> {
    const response = await this.groq.audio.speech.create({
      model: 'canopylabs/orpheus-v1-english',
      voice: 'hannah',   // closest to tara — warm female voice
                         // available voices: autumn diana hannah austin daniel troy
      input: text,
      response_format: 'wav',
    });
    const arrayBuffer = await response.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);
    this.logger.log(`Groq TTS: ${buf.length} bytes`);
    return buf;
  }

  // ── Google Translate TTS (Hindi / Kannada) ────────────────────────────────
  private async googleTranslateTTS(text: string, lang: string): Promise<Buffer | undefined> {
    // google-tts-api splits long text automatically and returns URL(s)
    const urls: string[] = googleTTS.getAllAudioUrls(text, {
      lang,
      slow: false,
      host: 'https://translate.google.com',
      splitPunct: ',.?!।',
    }).map((item: { url: string }) => item.url);

    const chunks: Buffer[] = [];
    for (const url of urls) {
      const res = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        headers: {
          // Mimic a browser request — Google rejects non-browser user agents
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
          'Referer': 'https://translate.google.com/',
        },
        timeout: 8000,
      });
      chunks.push(Buffer.from(res.data));
    }

    const buf = Buffer.concat(chunks);
    this.logger.log(`Google TTS: ${buf.length} bytes | lang: ${lang}`);
    return buf;
  }
}
