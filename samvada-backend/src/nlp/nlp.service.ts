import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';

export interface NlpResult {
  intent: string;
  structuredInterpretation: string;
  summary: string;
  keywords: string[];
  confidenceScore: number;       // 0–1
  detectedLanguage: string;
  isCodeMixed: boolean;
  dialectNotes?: string;
  extractedEntities: {
    location?: string;
    personName?: string;
    incidentType?: string;
    timeReference?: string;
  };
}

@Injectable()
export class NlpService {
  private readonly logger = new Logger(NlpService.name);
  private groq: Groq;

  constructor(private config: ConfigService) {
    this.groq = new Groq({ apiKey: this.config.get<string>('GROQ_API_KEY') });
  }

  async analyze(
    text: string,
    language: string,
    emotionContext: string,
    lastAiQuestion?: string,
  ): Promise<NlpResult> {
    try {
      const contextBlock = lastAiQuestion
        ? `PREVIOUS AI QUESTION: "${lastAiQuestion}" — interpret the citizen's reply in this context.\n`
        : '';

      // Use llama-3.1-8b-instant for NLP — fast, cheap, accurate enough for
      // intent classification and entity extraction. Saves ~800 tokens vs 70b.
      const prompt = `1092 Karnataka helpline NLP engine. Analyze the citizen message.
${contextBlock}
Message: "${text}" | Language: ${language}

Intents: greeting, affirmation, small_talk, farewell, report_accident, request_medical_help, report_fire, report_crime, report_missing_person, report_harassment, report_disaster, seek_information, other

RULE: Short replies ("Yes","No","Haan") in response to an AI question about an emergency = use the emergency intent, not "affirmation".

Return ONLY valid JSON:
{
  "intent": "<intent>",
  "structuredInterpretation": "<clear English sentence>",
  "summary": "<2-3 sentence summary>",
  "keywords": ["<kw1>","<kw2>","<kw3>"],
  "confidenceScore": <0.0-1.0>,
  "detectedLanguage": "<Kannada|Hindi|English>",
  "isCodeMixed": <true|false>,
  "dialectNotes": "<notes or null>",
  "extractedEntities": {
    "location": "<location or null>",
    "personName": "<name or null>",
    "incidentType": "<type or null>",
    "timeReference": "<time or null>"
  }
}`;

      const response = await this.groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',   // fast + cheap — saves ~800 tokens vs 70b
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 400,
        response_format: { type: 'json_object' },
      });

      const raw = response.choices[0]?.message?.content || '{}';
      const result = JSON.parse(raw) as NlpResult;
      this.logger.log(`NLP intent: ${result.intent} (confidence: ${result.confidenceScore})`);
      return result;
    } catch (error) {
      this.logger.error('NLP analysis failed:', error.message);
      return {
        intent: 'other',
        structuredInterpretation: text,
        summary: text,
        keywords: [],
        confidenceScore: 0.3,
        detectedLanguage: language,
        isCodeMixed: false,
        extractedEntities: {},
      };
    }
  }
}
