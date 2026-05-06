import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { NlpResult } from '../nlp/nlp.service';
import { EmotionResult } from '../emotion/emotion.service';
import { FeedbackStore } from '../feedback/feedback.store';

export type VerificationDecision = 'proceed' | 're-verify' | 'escalate' | 'critical-escalate';
export type FeedbackType = 'correct' | 'partial' | 'incorrect';

export interface VerificationResult {
  decision: VerificationDecision;
  confirmationQuestion: string;
  confidenceScore: number;
  verificationAttempt: number;
  reasoning: string;
}

export interface FeedbackActionResult {
  nextDecision: VerificationDecision;
  responseText: string;
  reasoning: string;
}

// ─── Unified dispatcher turn result ──────────────────────────────────────────
// Replaces the old separate verification + info-gathering calls.
// One LLM call per citizen turn — sees full history, produces one natural response.
export interface DispatcherTurnResult {
  response: string;                          // what to say to the citizen
  decision: VerificationDecision;            // routing decision
  collectedInfo: Record<string, string>;     // newly extracted info merged with existing
  infoComplete: boolean;                     // true when enough info is gathered
  requiresConfirmation: boolean;             // show yes/no/partial buttons
  reasoning: string;
  nextPhase: 'verify' | 'gather' | 'ready'; // phase to advance to after this turn
}

export interface InfoGatheringResult {
  question: string | null;
  collectedInfo: Record<string, string>;
  infoComplete: boolean;
}

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);
  private groq: Groq;

  private readonly HIGH_CONFIDENCE = 0.75;
  private readonly MAX_VERIFICATION_ATTEMPTS = 2;
  private readonly MAX_INFO_GATHERING_TURNS = 4;

  constructor(
    private config: ConfigService,
    private feedbackStore: FeedbackStore,
  ) {
    this.groq = new Groq({ apiKey: this.config.get<string>('GROQ_API_KEY') });
  }

  // ─── Unified Dispatcher Turn ──────────────────────────────────────────────
  // Single LLM call per citizen turn.
  // Enforces a strict 3-phase conversation:
  //   Phase 1 — VERIFY:  Confirm the AI's understanding before doing anything else.
  //   Phase 2 — GATHER:  Once confirmed, collect the missing details one at a time.
  //   Phase 3 — READY:   Enough verified info → escalate to human agent.
  //
  // The LLM decides when to advance phases. No hardcoded escalation triggers.

  async dispatcherTurn(
    nlpResult: NlpResult,
    emotionResult: EmotionResult,
    conversationHistory: Array<{ speaker: 'citizen' | 'ai'; text: string }>,
    collectedInfo: Record<string, string>,
    infoGatheringTurns: number,
    verificationAttempts: number,
    language: string,
    isCritical: boolean,
    conversationPhase: 'verify' | 'gather' | 'ready' = 'verify',
  ): Promise<DispatcherTurnResult> {

    const langFull = this.langName(language);
    const exampleBlock = this.feedbackStore.buildExampleBlock(3);

    const historyText = conversationHistory
      .slice(-6)   // last 6 turns is enough context — 12 was making the prompt too large
      .map(t => `${t.speaker === 'citizen' ? 'Citizen' : 'Dispatcher'}: ${t.text}`)
      .join('\n');

    const collectedText = Object.keys(collectedInfo).length > 0
      ? Object.entries(collectedInfo).map(([k, v]) => `  • ${k}: ${v}`).join('\n')
      : '  (nothing yet)';

    // Phase-specific instructions given to the LLM
    const phaseInstructions: Record<string, string> = {
      verify: `
CURRENT PHASE: VERIFY (Phase 1 of 3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Your ONLY job right now is to confirm your understanding of what the citizen reported.
Do NOT ask for location, names, or any other details yet.
Rephrase what you understood and ask the citizen to confirm it.

Example style (adapt to the actual situation):
  "You're saying there's a fire near you — is that right?"
  "So someone has been injured in an accident, correct?"
  "You're reporting that your house is on fire, is that correct?"

DECISION RULES for this phase:
  - "re-verify"  → Default. Ask your confirmation question. Set requiresConfirmation=true.
  - "escalate"   → Only if citizen is completely incoherent after ${this.MAX_VERIFICATION_ATTEMPTS} attempts.
  - "proceed"    → ONLY after citizen explicitly confirms (e.g. "yes", "correct", "haan", "sahi hai").
                   When you set proceed, also set nextPhase="gather".
  - "critical-escalate" → ONLY if citizen says something like "I'm dying", "someone is dead",
                           "building collapsed on people" — immediate life threat with zero ambiguity.
                           Even then, say one sentence acknowledging before connecting.

DO NOT set proceed or critical-escalate on the first turn unless the citizen has already confirmed.`,

      gather: `
CURRENT PHASE: GATHER (Phase 2 of 3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Understanding is confirmed. Now collect the missing details needed to help the citizen.
Ask ONE question at a time. Never repeat a question already answered.

Priority order for what to ask (skip if already collected):
  1. Exact location / address / landmark
  2. How many people are affected / injured
  3. Current status (is it still ongoing? is anyone trapped?)
  4. Any other critical detail specific to this incident type

DECISION RULES for this phase:
  - "re-verify"  → Still gathering. Ask the next most important question.
  - "proceed"    → You have location + at least 2 other key details. Set nextPhase="ready".
                   Say you are now connecting them to a specialist/agent.
  - "escalate"   → Citizen is unresponsive, confused, or ${infoGatheringTurns} turns used with no useful info.
  - "critical-escalate" → Situation has become immediately life-threatening mid-conversation.

Already collected:
${collectedText}`,

      ready: `
CURRENT PHASE: READY (Phase 3 of 3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You have enough verified information. Tell the citizen you are connecting them to a specialist now.
Be reassuring. One sentence maximum.
Set decision="proceed" and infoComplete=true.`,
    };

    const systemPrompt = `You are a calm, professional dispatcher for the 1092 government emergency helpline in Karnataka, India.
You are speaking directly with a citizen who needs help. This is a real emergency call.
${exampleBlock}

${phaseInstructions[conversationPhase]}

GENERAL CONVERSATION RULES (always apply):
- Respond entirely in ${langFull}. Never mix languages in your response.
- Keep your response to 1–2 short sentences maximum.
- Sound like a real human — warm, calm, never robotic.
- Never use filler phrases like "I understand", "I see", "Got it".
- Never ask two questions at once.
- Never repeat something already established in the conversation history.

SITUATION CONTEXT:
- Reported intent: ${nlpResult.intent}
- NLP interpretation: ${nlpResult.structuredInterpretation}
- NLP confidence: ${nlpResult.confidenceScore}
- Emotion: ${emotionResult.primaryEmotion} (urgency: ${emotionResult.urgencyScore})
- Is critical: ${isCritical}
- Verification attempts so far: ${verificationAttempts}/${this.MAX_VERIFICATION_ATTEMPTS}
- Info-gathering turns so far: ${infoGatheringTurns}

CONVERSATION HISTORY (most recent last):
${historyText || '(call just started — this is the first citizen message)'}

Respond ONLY with valid JSON — no extra text:
{
  "response": "<what to say to the citizen in ${langFull} — 1-2 sentences, natural>",
  "decision": "<re-verify|proceed|escalate|critical-escalate>",
  "nextPhase": "<verify|gather|ready — the phase to move to AFTER this turn>",
  "requiresConfirmation": <true if citizen needs to confirm yes/no/partial, false otherwise>,
  "newlyExtracted": { "<key>": "<value extracted from citizen's latest message, if any>" },
  "infoComplete": <true only when in ready phase or escalating with enough info>,
  "reasoning": "<one sentence internal note explaining your decision>"
}`;

    try {
      const res = await this.callWithRetry(() =>
        this.groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: systemPrompt }],
          temperature: 0.3,
          max_tokens: 200,   // 1-2 sentences + JSON overhead — 350 was wasteful
          response_format: { type: 'json_object' },
        }),
      );

      const parsed = JSON.parse(res.choices[0]?.message?.content || '{}');

      // Merge newly extracted info
      const updatedInfo = { ...collectedInfo, ...(parsed.newlyExtracted || {}) };

      // Resolve decision — LLM is trusted, but apply safety rails
      let decision: VerificationDecision = parsed.decision || 're-verify';

      // Safety rail 1: max verification attempts exceeded → force escalate
      if (verificationAttempts >= this.MAX_VERIFICATION_ATTEMPTS && decision === 're-verify') {
        decision = 'escalate';
      }

      // Safety rail 2: critical-escalate is only allowed when the LLM itself
      // chose it — we no longer force it based on isCritical alone.
      // isCritical is passed as context so the LLM can make that call.

      // Resolve next phase — advance only if LLM says so
      const nextPhase = (parsed.nextPhase as 'verify' | 'gather' | 'ready') || conversationPhase;

      this.logger.log(
        `DispatcherTurn | phase: ${conversationPhase}→${nextPhase} | decision: ${decision} | infoComplete: ${parsed.infoComplete} | turns: ${infoGatheringTurns}`,
      );

      return {
        response: parsed.response || this.staticFallback(language),
        decision,
        collectedInfo: updatedInfo,
        infoComplete: !!parsed.infoComplete,
        requiresConfirmation: !!parsed.requiresConfirmation,
        reasoning: parsed.reasoning || '',
        nextPhase,
      };
    } catch (error) {
      this.logger.error('DispatcherTurn failed:', error.message);
      return {
        response: this.contextFallback(language, conversationPhase, nlpResult.intent),
        decision: verificationAttempts >= this.MAX_VERIFICATION_ATTEMPTS ? 'escalate' : 're-verify',
        collectedInfo,
        infoComplete: false,
        requiresConfirmation: conversationPhase === 'verify',
        reasoning: 'LLM error — context fallback',
        nextPhase: conversationPhase,
      };
    }
  }

  // ─── Legacy evaluate() — kept for compatibility, delegates to dispatcherTurn ─
  // The gateway now calls dispatcherTurn directly, but this stays in case
  // anything else references it.
  async evaluate(
    nlpResult: NlpResult,
    emotionResult: EmotionResult,
    verificationAttempts: number,
    language: string,
  ): Promise<VerificationResult> {
    const confidence = nlpResult.confidenceScore;

    if (emotionResult.isCritical) {
      return {
        decision: 'critical-escalate',
        confirmationQuestion: '',
        confidenceScore: confidence,
        verificationAttempt: verificationAttempts,
        reasoning: 'Critical emotional state.',
      };
    }
    if (verificationAttempts >= this.MAX_VERIFICATION_ATTEMPTS) {
      return {
        decision: 'escalate',
        confirmationQuestion: '',
        confidenceScore: confidence,
        verificationAttempt: verificationAttempts,
        reasoning: 'Max attempts reached.',
      };
    }
    if (confidence >= this.HIGH_CONFIDENCE) {
      return {
        decision: 'proceed',
        confirmationQuestion: '',
        confidenceScore: confidence,
        verificationAttempt: verificationAttempts,
        reasoning: 'High confidence.',
      };
    }
    return {
      decision: 're-verify',
      confirmationQuestion: '',
      confidenceScore: confidence,
      verificationAttempt: verificationAttempts + 1,
      reasoning: 'Medium/low confidence.',
    };
  }

  // ─── Feedback Processing ──────────────────────────────────────────────────

  async processCitizenFeedback(
    feedbackType: FeedbackType,
    citizenMessage: string,
    aiInterpretation: string,
    verificationAttempts: number,
    language: string,
    conversationHistory: Array<{ speaker: 'citizen' | 'ai'; text: string }> = [],
  ): Promise<FeedbackActionResult> {
    const langFull = this.langName(language);

    this.feedbackStore.add({
      source: 'citizen',
      feedbackType,
      originalInterpretation: aiInterpretation,
      citizenMessage,
      language,
    });

    const historyText = conversationHistory
      .slice(-6)
      .map(t => `${t.speaker === 'citizen' ? 'Citizen' : 'Dispatcher'}: ${t.text}`)
      .join('\n');

    const exampleBlock = this.feedbackStore.buildExampleBlock(3);

    try {
      const res = await this.callWithRetry(() =>
        this.groq.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: `You are a 1092 helpline dispatcher. A citizen just gave feedback on your understanding.
${exampleBlock}
Conversation so far:
${historyText || '(none)'}

The citizen said: "${citizenMessage}"
You understood it as: "${aiInterpretation}"
Their feedback: ${feedbackType} (${feedbackType === 'correct' ? 'your understanding was right' : feedbackType === 'partial' ? 'partially right' : 'wrong'})
Attempts so far: ${verificationAttempts} / ${this.MAX_VERIFICATION_ATTEMPTS}

Respond naturally — acknowledge the feedback and either proceed, ask a clarifying question, or escalate.
Keep your response to 1 short sentence in ${langFull}.

Respond ONLY with valid JSON:
{
  "nextDecision": "<proceed|re-verify|escalate>",
  "responseText": "<1 short sentence in ${langFull}, natural and grammatically correct>",
  "reasoning": "<one sentence>"
}`,
            },
          ],
          temperature: 0.3,
          max_tokens: 150,
          response_format: { type: 'json_object' },
        }),
      );

      const parsed = JSON.parse(res.choices[0]?.message?.content || '{}');
      this.logger.log(`CitizenFeedback | ${feedbackType} | next: ${parsed.nextDecision}`);

      return {
        nextDecision: parsed.nextDecision ||
          (verificationAttempts >= this.MAX_VERIFICATION_ATTEMPTS ? 'escalate' : 're-verify'),
        responseText: parsed.responseText || this.staticFallback(language),
        reasoning: parsed.reasoning || '',
      };
    } catch (error) {
      this.logger.error('Citizen feedback processing failed:', error.message);
      return {
        nextDecision: verificationAttempts >= this.MAX_VERIFICATION_ATTEMPTS ? 'escalate' : 're-verify',
        responseText: this.staticFallback(language),
        reasoning: 'LLM error — fallback',
      };
    }
  }

  // ─── Legacy info gathering — kept for compatibility ───────────────────────
  async getNextInfoQuestion(
    problemDescription: string,
    conversationHistory: Array<{ speaker: 'citizen' | 'ai'; text: string }>,
    collectedInfo: Record<string, string>,
    infoGatheringTurns: number,
    language: string,
  ): Promise<InfoGatheringResult> {
    // Delegate to dispatcherTurn with a dummy nlp/emotion result
    // This path is no longer called by the gateway but kept for safety
    if (infoGatheringTurns >= this.MAX_INFO_GATHERING_TURNS) {
      return { question: null, collectedInfo, infoComplete: true };
    }
    return { question: null, collectedInfo, infoComplete: true };
  }

  recordAgentCorrection(
    citizenMessage: string,
    aiInterpretation: string,
    correctedInterpretation: string,
    language: string,
    intent?: string,
  ): void {
    this.feedbackStore.add({
      source: 'agent',
      feedbackType: 'override',
      originalInterpretation: aiInterpretation,
      correctedInterpretation,
      citizenMessage,
      language,
      intent,
      notes: 'Agent manually corrected AI interpretation',
    });
    this.logger.log(`Agent correction stored: "${aiInterpretation}" → "${correctedInterpretation}"`);
  }

  private staticFallback(language: string): string {
    if (language === 'kn') return 'ದಯವಿಟ್ಟು ಮತ್ತೆ ವಿವರಿಸಿ.';
    if (language === 'hi') return 'कृपया फिर से बताएं।';
    return 'Could you tell me more about what happened?';
  }

  /**
   * Context-aware fallback — uses the conversation phase and NLP intent
   * to give a relevant response when the LLM is unavailable (e.g. rate limit).
   * Much better than repeating the same generic string every turn.
   */
  private contextFallback(
    language: string,
    phase: 'verify' | 'gather' | 'ready',
    intent: string,
  ): string {
    const lang = language as 'kn' | 'hi' | 'en';

    // Phase-aware fallbacks
    if (phase === 'verify') {
      // Confirmation question based on intent
      const verifyMap: Record<string, Record<'kn' | 'hi' | 'en', string>> = {
        report_fire:          { kn: 'ನಿಮ್ಮ ಬಳಿ ಬೆಂಕಿ ಹತ್ತಿದೆ ಎಂದು ಹೇಳುತ್ತಿದ್ದೀರಾ?', hi: 'क्या आप कह रहे हैं कि आपके पास आग लगी है?', en: 'You\'re saying there\'s a fire nearby — is that correct?' },
        request_medical_help: { kn: 'ಯಾರಿಗಾದರೂ ವೈದ್ಯಕೀಯ ಸಹಾಯ ಬೇಕು ಎಂದು ಹೇಳುತ್ತಿದ್ದೀರಾ?', hi: 'क्या आप कह रहे हैं कि किसी को चिकित्सा सहायता चाहिए?', en: 'You\'re saying someone needs medical help — is that right?' },
        report_accident:      { kn: 'ಅಪಘಾತ ಆಗಿದೆ ಎಂದು ಹೇಳುತ್ತಿದ್ದೀರಾ?', hi: 'क्या आप कह रहे हैं कि कोई दुर्घटना हुई है?', en: 'You\'re reporting an accident — is that correct?' },
        report_crime:         { kn: 'ಅಪರಾಧ ನಡೆದಿದೆ ಎಂದು ಹೇಳುತ್ತಿದ್ದೀರಾ?', hi: 'क्या आप कह रहे हैं कि कोई अपराध हुआ है?', en: 'You\'re reporting a crime — is that correct?' },
        report_missing_person:{ kn: 'ಯಾರಾದರೂ ಕಾಣೆಯಾಗಿದ್ದಾರೆ ಎಂದು ಹೇಳುತ್ತಿದ್ದೀರಾ?', hi: 'क्या आप कह रहे हैं कि कोई लापता है?', en: 'You\'re saying someone is missing — is that right?' },
        report_disaster:      { kn: 'ದುರಂತ ಸಂಭವಿಸಿದೆ ಎಂದು ಹೇಳುತ್ತಿದ್ದೀರಾ?', hi: 'क्या आप कह रहे हैं कि कोई आपदा आई है?', en: 'You\'re reporting a disaster — is that correct?' },
      };
      const match = verifyMap[intent];
      if (match) return match[lang] ?? match['en'];
      // Generic verify fallback
      return lang === 'kn' ? 'ನೀವು ಏನು ಹೇಳುತ್ತಿದ್ದೀರಿ ಎಂದು ದಯವಿಟ್ಟು ದೃಢಪಡಿಸಿ.'
           : lang === 'hi' ? 'कृपया बताएं कि आप क्या कह रहे हैं।'
           : 'Can you confirm what you just told me?';
    }

    if (phase === 'gather') {
      // Ask for location — most critical missing piece
      return lang === 'kn' ? 'ನಿಮ್ಮ ಸ್ಥಳ ಅಥವಾ ವಿಳಾಸ ಹೇಳಿ.'
           : lang === 'hi' ? 'आप कहाँ हैं? पता या लैंडमार्क बताएं।'
           : 'Where are you? Please give your location or a nearby landmark.';
    }

    // ready phase
    return lang === 'kn' ? 'ನಿಮ್ಮನ್ನು ಸಹಾಯಕ್ಕೆ ಸಂಪರ್ಕಿಸುತ್ತಿದ್ದೇವೆ.'
         : lang === 'hi' ? 'हम आपको सहायता से जोड़ रहे हैं।'
         : 'We are connecting you to help now.';
  }

  /**
   * Retry an LLM call up to 3 times with exponential backoff on 429 errors.
   * Waits: 5s → 15s → 30s before giving up.
   */
  private async callWithRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
    const delays = [5000, 15000, 30000];
    let lastError: any;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastError = err;
        const is429 = err?.status === 429 ||
          err?.message?.includes('429') ||
          err?.message?.includes('rate_limit_exceeded');
        if (is429 && attempt < maxAttempts - 1) {
          const wait = delays[attempt];
          this.logger.warn(`Rate limit hit — retrying in ${wait / 1000}s (attempt ${attempt + 1}/${maxAttempts})`);
          await new Promise(r => setTimeout(r, wait));
        } else {
          throw err;
        }
      }
    }
    throw lastError;
  }

  private langName(code: string): string {
    const map: Record<string, string> = { kn: 'Kannada', hi: 'Hindi', en: 'English' };
    return map[code] ?? 'English';
  }

  // ─── Agent Type Determination ─────────────────────────────────────────────
  // Called ONLY at escalation time — uses the full conversation context
  // (collectedInfo, summary, keywords, full transcript) to decide which
  // specialist to route to. Never called mid-conversation.

  async determineAgentType(
    conversationHistory: Array<{ speaker: 'citizen' | 'ai'; text: string }>,
    collectedInfo: Record<string, string>,
    summary: string,
    keywords: string[],
    priority: string,
  ): Promise<'police' | 'ambulance' | 'fire' | 'general'> {
    // Build a compact context string from everything gathered
    const historyText = conversationHistory
      .slice(-10)
      .map(t => `${t.speaker === 'citizen' ? 'Citizen' : 'Dispatcher'}: ${t.text}`)
      .join('\n');

    const collectedText = Object.keys(collectedInfo).length > 0
      ? Object.entries(collectedInfo).map(([k, v]) => `${k}: ${v}`).join(', ')
      : 'none';

    try {
      const res = await this.callWithRetry(() =>
        this.groq.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: `You are a 1092 Karnataka government helpline dispatcher.
Based on the full conversation context below, decide which specialist emergency service to route this call to.

CONVERSATION:
${historyText || '(no history)'}

COLLECTED INFO: ${collectedText}
SUMMARY: ${summary || 'none'}
KEYWORDS: ${(keywords || []).join(', ') || 'none'}
PRIORITY: ${priority}

Choose EXACTLY ONE of these four options:
- "police"    → crime, theft, assault, harassment, missing person, law enforcement needed
- "ambulance" → medical emergency, injury, unconscious person, accident with casualties
- "fire"      → fire, explosion, smoke, building collapse, natural disaster
- "general"   → anything else, unclear, or general helpline query

Respond ONLY with valid JSON:
{ "agentType": "<police|ambulance|fire|general>", "reasoning": "<one sentence>" }`,
            },
          ],
          temperature: 0.1,
          max_tokens: 60,
          response_format: { type: 'json_object' },
        }),
      );

      const parsed = JSON.parse(res.choices[0]?.message?.content || '{}');
      const agentType = parsed.agentType as 'police' | 'ambulance' | 'fire' | 'general';
      this.logger.log(`AgentType determined: ${agentType} | reason: ${parsed.reasoning}`);

      if (['police', 'ambulance', 'fire', 'general'].includes(agentType)) {
        return agentType;
      }
      return 'general';
    } catch (error) {
      this.logger.error('AgentType determination failed:', error.message);
      // Keyword-based fallback when LLM is unavailable
      const allText = [summary, ...keywords, ...Object.values(collectedInfo)]
        .join(' ').toLowerCase();
      if (/fire|flame|burn|smoke|explosion|blast|disaster|flood|earthquake/.test(allText)) return 'fire';
      if (/medical|ambulance|injury|hurt|blood|unconscious|accident|hospital/.test(allText)) return 'ambulance';
      if (/police|crime|theft|robbery|assault|murder|missing|kidnap|harass/.test(allText)) return 'police';
      return 'general';
    }
  }
}
