import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { NlpResult } from '../nlp/nlp.service';

export type EmotionLabel =
  | 'panic'
  | 'distress'
  | 'anger'
  | 'fear'
  | 'confusion'
  | 'urgency'
  | 'sadness'
  | 'neutral'
  | 'calm';

export type PriorityLevel = 'critical' | 'moderate' | 'low';

export interface EmotionResult {
  primaryEmotion: EmotionLabel;
  emotionScore: number;       // 0–1
  urgencyScore: number;       // 0–1
  sentimentPolarity: 'negative' | 'neutral' | 'positive';
  emotionBreakdown: Record<EmotionLabel, number>;
  isCritical: boolean;
}

export interface CombinedAnalysisResult {
  emotion: EmotionResult;
  priority: {
    level: PriorityLevel;
    score: number;   // 0–100
    reasons: string[];
  };
}

@Injectable()
export class EmotionService {
  private readonly logger = new Logger(EmotionService.name);
  private groq: Groq;

  constructor(private config: ConfigService) {
    this.groq = new Groq({ apiKey: this.config.get<string>('GROQ_API_KEY') });
  }

  /**
   * Analyze emotion AND priority in a single LLM call.
   * Replaces the old separate emotion.analyze() + priority.calculate() calls.
   * Saves ~500 tokens per turn.
   */
  async analyzeWithPriority(
    text: string,
    language: string,
    nlpResult: NlpResult,
  ): Promise<CombinedAnalysisResult> {
    try {
      const prompt = `You are an analysis engine for the 1092 government emergency helpline in Karnataka, India.
Analyze the citizen message for BOTH emotion and priority in one pass.

Citizen message (English): "${text}"
Language: ${language}
NLP intent: ${nlpResult.intent}
NLP interpretation: ${nlpResult.structuredInterpretation}
Keywords: ${(nlpResult.keywords || []).join(', ')}
NLP confidence: ${nlpResult.confidenceScore}

Return ONLY valid JSON:
{
  "emotion": {
    "primaryEmotion": "<panic|distress|anger|fear|confusion|urgency|sadness|neutral|calm>",
    "emotionScore": <0.0-1.0>,
    "urgencyScore": <0.0-1.0>,
    "sentimentPolarity": "<negative|neutral|positive>",
    "emotionBreakdown": {
      "panic": <0.0-1.0>, "distress": <0.0-1.0>, "anger": <0.0-1.0>,
      "fear": <0.0-1.0>, "confusion": <0.0-1.0>, "urgency": <0.0-1.0>,
      "sadness": <0.0-1.0>, "neutral": <0.0-1.0>, "calm": <0.0-1.0>
    },
    "isCritical": <true if panic/distress/anger AND urgencyScore > 0.8>
  },
  "priority": {
    "level": "<critical|moderate|low>",
    "score": <0-100>,
    "reasons": ["<reason 1>", "<reason 2>"]
  }
}

Priority guidelines:
- critical (70-100): Immediate threat to life, fire, medical crisis, violence, active emergency
- moderate (40-69): Urgent but not immediately life-threatening — missing person, theft, harassment
- low (0-39): General inquiry, minor complaint, non-urgent`;

      const response = await this.groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',   // fast + cheap — saves ~500 tokens vs 70b
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 350,
        response_format: { type: 'json_object' },
      });

      const raw = response.choices[0]?.message?.content || '{}';
      const result = JSON.parse(raw) as CombinedAnalysisResult;

      // Safety: if emotion is critical, floor priority to critical
      if (result.emotion?.isCritical && result.priority?.level !== 'critical') {
        result.priority.level = 'critical';
        result.priority.score = Math.max(result.priority.score ?? 0, 85);
        result.priority.reasons = result.priority.reasons ?? [];
        result.priority.reasons.push('Emotion engine flagged as critical');
      }

      this.logger.log(
        `Emotion+Priority | ${result.emotion?.primaryEmotion} (urgency: ${result.emotion?.urgencyScore}) | ${result.priority?.level} (${result.priority?.score})`,
      );
      return result;
    } catch (error) {
      this.logger.error('Emotion+Priority analysis failed:', error.message);
      return this.fallback(nlpResult);
    }
  }

  /**
   * Kept for backward compatibility — wraps analyzeWithPriority.
   * Callers that only need emotion can still use this.
   */
  async analyze(text: string, language: string): Promise<EmotionResult> {
    try {
      const prompt = `Analyze emotion in this helpline message: "${text}" (language: ${language})
Return ONLY valid JSON:
{
  "primaryEmotion": "<panic|distress|anger|fear|confusion|urgency|sadness|neutral|calm>",
  "emotionScore": <0.0-1.0>,
  "urgencyScore": <0.0-1.0>,
  "sentimentPolarity": "<negative|neutral|positive>",
  "emotionBreakdown": {
    "panic": <0.0-1.0>, "distress": <0.0-1.0>, "anger": <0.0-1.0>,
    "fear": <0.0-1.0>, "confusion": <0.0-1.0>, "urgency": <0.0-1.0>,
    "sadness": <0.0-1.0>, "neutral": <0.0-1.0>, "calm": <0.0-1.0>
  },
  "isCritical": <true if panic/distress/anger AND urgencyScore > 0.8>
}`;

      const response = await this.groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 250,
        response_format: { type: 'json_object' },
      });

      const raw = response.choices[0]?.message?.content || '{}';
      return JSON.parse(raw) as EmotionResult;
    } catch (error) {
      this.logger.error('Emotion analysis failed:', error.message);
      return this.emotionFallback();
    }
  }

  private fallback(nlpResult: NlpResult): CombinedAnalysisResult {
    const emotion = this.emotionFallback();
    const level: PriorityLevel =
      ['report_fire', 'request_medical_help', 'report_accident', 'report_crime', 'report_disaster'].includes(nlpResult.intent)
        ? 'critical'
        : ['report_missing_person', 'report_harassment'].includes(nlpResult.intent)
          ? 'moderate'
          : 'low';
    return {
      emotion,
      priority: {
        level,
        score: level === 'critical' ? 80 : level === 'moderate' ? 50 : 20,
        reasons: ['Fallback: LLM unavailable, intent-based priority'],
      },
    };
  }

  private emotionFallback(): EmotionResult {
    return {
      primaryEmotion: 'neutral',
      emotionScore: 0.5,
      urgencyScore: 0.3,
      sentimentPolarity: 'neutral',
      emotionBreakdown: {
        panic: 0, distress: 0, anger: 0, fear: 0,
        confusion: 0.3, urgency: 0.2, sadness: 0,
        neutral: 0.8, calm: 0.5,
      },
      isCritical: false,
    };
  }
}
