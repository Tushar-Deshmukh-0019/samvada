import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { SttService } from '../stt/stt.service';
import { EmotionService } from '../emotion/emotion.service';
import { NlpService } from '../nlp/nlp.service';
import { VerificationService } from '../verification/verification.service';
import { ResponseService } from '../response/response.service';
import { SessionService } from '../session/session.service';
import { AudioStore } from '../audio/audio-playback';
import { AUDIO_PLAYBACK_ENABLED } from '../audio/audio-playback';

@WebSocketGateway({
  cors: {
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      : ['http://localhost:5173', 'http://localhost:3001'],
    credentials: true,
  },
  maxHttpBufferSize: 10 * 1024 * 1024,
})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketGateway.name);

  // Audio chunks keyed by sessionId so they survive socket reconnects
  private audioChunks = new Map<string, Buffer[]>();
  // Agent audio chunks keyed by sessionId
  private agentAudioChunks = new Map<string, Buffer[]>();

  constructor(
    private sttService: SttService,
    private emotionService: EmotionService,
    private nlpService: NlpService,
    private verificationService: VerificationService,
    private responseService: ResponseService,
    private sessionService: SessionService,
    private audioStore: AudioStore,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    const session = this.sessionService.findBySocketId(client.id);
    if (session) {
      this.sessionService.close(session.sessionId);
      this.audioChunks.delete(session.sessionId);

      // Flush all in-memory audio for this session to Supabase Storage async.
      // This runs after close() so the session row already has status='closed'.
      this.audioStore.flushToStorage(session.sessionId).catch((err) =>
        this.logger.error(`Audio flush failed for ${session.sessionId}: ${err.message}`),
      );

      if (session.agentSocketId) {
        this.server.to(session.agentSocketId).emit('citizen_disconnected', {
          sessionId: session.sessionId,
        });
      }
    }
  }

  // ─── Citizen Events ───────────────────────────────────────────────────────

  @SubscribeMessage('start_call')
  handleStartCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { location?: { lat: number; lng: number } },
  ) {
    const session = this.sessionService.create(client.id);
    if (data?.location) {
      this.sessionService.update(session.sessionId, { location: data.location });
    }
    this.audioChunks.set(session.sessionId, []);
    client.emit('call_started', { sessionId: session.sessionId });
    this.logger.log(`Call started: ${session.sessionId}`);
    this.server.to('agents').emit('new_call', {
      sessionId: session.sessionId,
      startTime: session.startTime,
      location: data?.location,
    });
  }

  @SubscribeMessage('audio_chunk')
  handleAudioChunk(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { chunk: ArrayBuffer; sessionId: string },
  ) {
    if (!data.sessionId) return;
    // Drop incoming audio once the call has been escalated to a human agent
    const session = this.sessionService.findById(data.sessionId);
    if (session?.status === 'escalated') return;
    const chunks = this.audioChunks.get(data.sessionId) || [];
    chunks.push(Buffer.from(data.chunk));
    this.audioChunks.set(data.sessionId, chunks);
  }

  @SubscribeMessage('audio_end')
  async handleAudioEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; mimeType?: string },
  ) {
    this.logger.log(`audio_end | sessionId: ${data.sessionId}`);

    const session = this.sessionService.findById(data.sessionId);
    if (!session) {
      client.emit('error', { message: 'Session not found' });
      return;
    }

    // Once escalated the AI pipeline is frozen — only the human agent speaks
    if (session.status === 'escalated') {
      this.audioChunks.set(data.sessionId, []); // discard buffered chunks
      return;
    }

    const chunks = this.audioChunks.get(data.sessionId) || [];
    if (chunks.length === 0) {
      client.emit('stt_retry', { message: 'No audio received. Please tap the mic and speak.' });
      return;
    }

    const audioBuffer = Buffer.concat(chunks);
    this.audioChunks.set(data.sessionId, []);
    client.emit('processing', { status: 'transcribing' });

    try {
      await this.processPipeline(client, session.sessionId, audioBuffer, data.mimeType);
    } catch (error) {
      this.logger.error('Pipeline error:', error.message);
      client.emit('pipeline_error', { message: error.message });
      await this.escalateToAgent(client, session.sessionId, 'Pipeline failure');
    }
  }

  @SubscribeMessage('verification_feedback')
  async handleVerificationFeedback(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; feedback: 'correct' | 'partial' | 'incorrect' },
  ) {
    const session = this.sessionService.findById(data.sessionId);
    if (!session) return;

    // Ignore feedback after escalation — human agent is in control
    if (session.status === 'escalated') return;

    const dominantLang = this.sessionService.getDominantLanguage(data.sessionId);

    // Get the last citizen message and last AI interpretation for context
    const citizenTurns = session.transcripts.filter(t => t.speaker === 'citizen');
    const aiTurns = session.transcripts.filter(t => t.speaker === 'ai');
    const lastCitizenMsg = citizenTurns[citizenTurns.length - 1]?.englishText || '';
    const lastAiMsg = aiTurns[aiTurns.length - 1]?.originalText || '';

    // LLM decides what to do next based on the feedback + full context
    const feedbackResult = await this.verificationService.processCitizenFeedback(
      data.feedback,
      lastCitizenMsg,
      lastAiMsg,
      session.verificationAttempts,
      dominantLang,
      session.transcripts.map(t => ({ speaker: t.speaker as 'citizen' | 'ai', text: t.englishText || t.originalText })),
    );

    this.sessionService.update(data.sessionId, {
      verificationAttempts: session.verificationAttempts + 1,
    });

    if (feedbackResult.nextDecision === 'proceed') {
      // Send the AI's response text, then confirm
      await this.sendAiResponse(client, data.sessionId, feedbackResult.responseText, dominantLang, false);
      client.emit('verification_confirmed', { sessionId: data.sessionId });
      this.pushAnalysisToAgent(data.sessionId);
    } else if (feedbackResult.nextDecision === 'escalate') {
      await this.sendAiResponse(client, data.sessionId, feedbackResult.responseText, dominantLang, false);
      await this.escalateToAgent(client, data.sessionId, 'Repeated misunderstanding after feedback');
    } else {
      // re-verify — send the LLM-generated retry message
      await this.sendAiResponse(client, data.sessionId, feedbackResult.responseText, dominantLang, false);
      client.emit('re_verify', {
        sessionId: data.sessionId,
        message: feedbackResult.responseText,
      });
    }
  }

  @SubscribeMessage('update_location')
  handleLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; lat: number; lng: number; readable?: string },
  ) {
    this.sessionService.update(data.sessionId, {
      location: { lat: data.lat, lng: data.lng, readable: data.readable },
    });
    const session = this.sessionService.findById(data.sessionId);
    if (session?.agentSocketId) {
      this.server.to(session.agentSocketId).emit('location_updated', {
        sessionId: data.sessionId,
        location: { lat: data.lat, lng: data.lng, readable: data.readable },
      });
    }
  }

  // ─── Agent Events ─────────────────────────────────────────────────────────

  @SubscribeMessage('agent_join')
  handleAgentJoin(@ConnectedSocket() client: Socket) {
    client.join('agents');
    this.logger.log(`Agent joined: ${client.id}`);
    const activeSessions = this.sessionService.getAll().filter(s => s.status !== 'closed');
    client.emit('active_sessions', { sessions: activeSessions });
  }

  @SubscribeMessage('agent_takeover')
  handleAgentTakeover(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    this.sessionService.assignAgent(data.sessionId, client.id);
    this.sessionService.update(data.sessionId, { status: 'escalated' });
    const session = this.sessionService.findById(data.sessionId);
    if (session) {
      this.server.to(session.citizenSocketId).emit('agent_connected', {
        message: 'A human agent has joined the call.',
      });
      client.emit('takeover_confirmed', { session });
    }
  }

  @SubscribeMessage('agent_message')
  async handleAgentMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; message: string; language: string },
  ) {
    const session = this.sessionService.findById(data.sessionId);
    if (!session) return;
    const tts = await this.responseService.textToSpeech(data.message, data.language);

    const agentTranscriptId = `t_agent_${Date.now()}`;
    if (tts?.buffer && tts?.mimeType) {
      this.audioStore.save(agentTranscriptId, tts.buffer, tts.mimeType, data.sessionId);
    }
    const agentAudioUrl = (AUDIO_PLAYBACK_ENABLED && tts?.buffer) ? `/audio/${agentTranscriptId}` : undefined;

    this.server.to(session.citizenSocketId).emit('agent_voice', {
      text: data.message,
      audio: tts?.buffer ? tts.buffer.toString('base64') : null,
      audioMimeType: tts?.mimeType,
      language: data.language,
    });

    // Translate agent message to English for the dashboard if needed
    const agentEnglishText = (data.language === 'en')
      ? data.message
      : await this.sttService.translateToEnglish(data.message, data.language);

    this.sessionService.addTranscript(data.sessionId, {
      id: agentTranscriptId,
      speaker: 'ai',
      originalText: data.message,
      englishText: agentEnglishText,
      language: data.language,
      timestamp: new Date(),
      audioUrl: agentAudioUrl,
    });
    this.emitToAgent(data.sessionId, 'live_transcript', {
      sessionId: data.sessionId,
      transcript: {
        id: agentTranscriptId,
        speaker: 'ai',
        originalText: data.message,
        englishText: agentEnglishText,
        language: data.language,
        timestamp: new Date(),
        audioUrl: agentAudioUrl,
      },
    });
  }

  // ─── Agent Live Mic Events ────────────────────────────────────────────────
  // Agent audio is forwarded DIRECTLY to the citizen — no STT, no TTS, no LLM.
  // This keeps the agent voice path completely isolated from the AI pipeline
  // so it never competes for Groq API quota or adds latency to citizen turns.

  @SubscribeMessage('agent_audio_chunk')
  handleAgentAudioChunk(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { chunk: ArrayBuffer; sessionId: string },
  ) {
    if (!data.sessionId) return;
    const chunks = this.agentAudioChunks.get(data.sessionId) || [];
    chunks.push(Buffer.from(data.chunk));
    this.agentAudioChunks.set(data.sessionId, chunks);
  }

  @SubscribeMessage('agent_audio_end')
  async handleAgentAudioEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; mimeType?: string },
  ) {
    this.logger.log(`agent_audio_end | sessionId: ${data.sessionId}`);

    const session = this.sessionService.findById(data.sessionId);
    if (!session) return;

    const chunks = this.agentAudioChunks.get(data.sessionId) || [];
    if (chunks.length === 0) return;

    const audioBuffer = Buffer.concat(chunks);
    this.agentAudioChunks.set(data.sessionId, []);

    // ── Forward raw audio directly to citizen — zero AI calls ────────────
    // No STT, no TTS, no LLM. The agent's mic audio is base64-encoded and
    // sent straight to the citizen's browser for playback.
    // This path never touches Groq and cannot interfere with the AI pipeline.
    const mimeType = data.mimeType ?? 'audio/webm';
    this.server.to(session.citizenSocketId).emit('agent_voice', {
      audio: audioBuffer.toString('base64'),
      audioMimeType: mimeType,
      // No text — citizen side plays audio directly, no TTS needed
    });

    // ── Add a lightweight transcript entry for the dashboard ─────────────
    // We don't transcribe here (that would cost an API call).
    // The dashboard shows a "Agent spoke" placeholder with a play button.
    const agentTranscriptId = `t_agent_${Date.now()}`;
    this.audioStore.save(agentTranscriptId, audioBuffer, mimeType, data.sessionId);
    const agentAudioUrl = AUDIO_PLAYBACK_ENABLED ? `/audio/${agentTranscriptId}` : undefined;

    this.sessionService.addTranscript(data.sessionId, {
      id: agentTranscriptId,
      speaker: 'ai',
      originalText: '[Agent spoke]',
      englishText: '[Agent spoke]',
      language: session.language || 'en',
      timestamp: new Date(),
      audioUrl: agentAudioUrl,
    });

    this.emitToAgent(data.sessionId, 'live_transcript', {
      sessionId: data.sessionId,
      transcript: {
        id: agentTranscriptId,
        speaker: 'ai',
        originalText: '[Agent spoke]',
        englishText: '[Agent spoke]',
        language: session.language || 'en',
        timestamp: new Date(),
        audioUrl: agentAudioUrl,
      },
    });

    this.logger.log(`Agent audio forwarded to citizen | ${audioBuffer.length} bytes | session: ${data.sessionId}`);
  }

  @SubscribeMessage('agent_override_interpretation')
  handleAgentOverride(    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; correctedInterpretation: string; correctedSentiment: string },
  ) {
    const session = this.sessionService.findById(data.sessionId);
    if (session) {
      // Store the correction so future LLM calls learn from it
      const lastCitizenTurn = session.transcripts.filter(t => t.speaker === 'citizen').slice(-1)[0];
      this.verificationService.recordAgentCorrection(
        lastCitizenTurn?.englishText || lastCitizenTurn?.originalText || '',
        session.summary || '',
        data.correctedInterpretation,
        session.language,
        undefined,
      );
      this.sessionService.update(data.sessionId, { summary: data.correctedInterpretation });
      client.emit('override_saved', { sessionId: data.sessionId });
    }
  }

  // ─── Core Pipeline ────────────────────────────────────────────────────────

  private async processPipeline(
    client: Socket,
    sessionId: string,
    audioBuffer: Buffer,
    mimeType?: string,
  ) {
    const session = this.sessionService.findById(sessionId);
    if (!session) return;

    // ── 1. STT ────────────────────────────────────────────────────────────
    client.emit('processing', { status: 'transcribing' });
    let sttResult;
    try {
      sttResult = await this.sttService.transcribe(audioBuffer, mimeType);
    } catch (sttError) {
      this.logger.error(`STT error on ${sessionId}: ${sttError.message}`);
      client.emit('stt_retry', { message: 'Could not understand audio. Please speak again.' });
      return;
    }

    if (!sttResult.text?.trim()) {
      client.emit('stt_retry', { message: 'No speech detected. Please try again.' });
      return;
    }

    // ── Language tracking ─────────────────────────────────────────────────
    const wordCount = sttResult.text.trim().split(/\s+/).length;
    this.sessionService.recordLanguage(sessionId, sttResult.language, wordCount);
    const dominantLanguage = this.sessionService.getDominantLanguage(sessionId);
    this.logger.log(`Turn lang: ${sttResult.language} (${wordCount}w) | Dominant: ${dominantLanguage}`);

    // Translate to English for NLP
    const englishText = await this.sttService.translateToEnglish(sttResult.text, sttResult.language);

    // Add citizen transcript — store the raw audio so the agent can replay it
    // (only when AUDIO_PLAYBACK_ENABLED = 1 in src/config/featureFlags.ts)
    const transcriptId = `t_${Date.now()}`;
    this.audioStore.save(transcriptId, audioBuffer, mimeType ?? 'audio/webm', sessionId);
    const citizenAudioUrl = AUDIO_PLAYBACK_ENABLED ? `/audio/${transcriptId}` : undefined;
    this.sessionService.addTranscript(sessionId, {
      id: transcriptId,
      speaker: 'citizen',
      originalText: sttResult.text,
      englishText,
      language: sttResult.language,
      timestamp: new Date(),
      audioUrl: citizenAudioUrl,
    });
    this.emitToAgent(sessionId, 'live_transcript', {
      sessionId,
      transcript: { id: transcriptId, speaker: 'citizen', originalText: sttResult.text, englishText, language: sttResult.language, timestamp: new Date(), audioUrl: citizenAudioUrl },
    });

    // ── 2. NLP + Emotion+Priority in PARALLEL ────────────────────────────
    // Both are independent of each other — run simultaneously.
    // NLP needs the text; Emotion+Priority needs the text + NLP result.
    // We run NLP first (fast, 8b), then fire emotion+priority immediately after.
    // Translation also runs in parallel with NLP since it only needs the raw text.
    client.emit('processing', { status: 'analyzing' });

    const sessionForContext = this.sessionService.findById(sessionId);
    const lastAiQuestion = (sessionForContext?.transcripts || [])
      .filter(t => t.speaker === 'ai')
      .slice(-1)[0]?.originalText;

    // Run NLP and emotion+priority sequentially (emotion needs NLP result)
    // but run them concurrently with nothing else blocking them
    const nlpResult = await this.nlpService.analyze(
      englishText, sttResult.language, '', lastAiQuestion,
    );

    const combinedAnalysis = await this.emotionService.analyzeWithPriority(
      englishText, sttResult.language, nlpResult,
    );
    const emotionResult  = combinedAnalysis.emotion;
    const priorityResult = combinedAnalysis.priority;

    this.sessionService.addEmotion(sessionId, {
      timestamp: new Date(),
      emotion: emotionResult.primaryEmotion,
      score: emotionResult.emotionScore,
      urgency: emotionResult.urgencyScore,
    });
    this.sessionService.update(sessionId, {
      language: dominantLanguage,
      summary: nlpResult.summary,
      keywords: nlpResult.keywords,
    });

    // ── Non-problem intents on first turn only ────────────────────────────
    const NON_PROBLEM_INTENTS = ['greeting', 'affirmation', 'small_talk', 'farewell', 'thanks'];
    const currentSessionState = this.sessionService.findById(sessionId);
    const priorCitizenTurns = (currentSessionState?.transcripts || [])
      .filter(t => t.speaker === 'citizen').length;
    const isFirstTurn = priorCitizenTurns <= 1;
    if (NON_PROBLEM_INTENTS.includes(nlpResult.intent) && isFirstTurn) {
      const promptMessages: Record<string, string> = {
        kn: 'ನಿಮ್ಮ ಸಮಸ್ಯೆ ಹೇಳಿ.',
        hi: 'अपनी समस्या बताएं।',
        en: 'Please tell us your problem.',
      };
      await this.sendAiResponse(client, sessionId, promptMessages[dominantLanguage] ?? promptMessages['en'], dominantLanguage, false);
      return;
    }

    // ── 3. Persist emotion + priority (already computed above) ───────────
    this.sessionService.update(sessionId, { priority: priorityResult.level });
    this.emitToAgent(sessionId, 'emotion_update', { sessionId, emotion: emotionResult, priority: priorityResult });

    // ── 4 + 5. Unified dispatcher turn (verification + info gathering) ────
    // One LLM call that sees the full conversation history, decides what to
    // ask next, and produces a single natural response. No more separate
    // verification and info-gathering calls.
    client.emit('processing', { status: 'verifying' });

    const currentSession = this.sessionService.findById(sessionId);
    const isCritical =
      emotionResult.isCritical || priorityResult.level === 'critical';

    const conversationHistory = (currentSession?.transcripts || []).map(t => ({
      speaker: t.speaker as 'citizen' | 'ai',
      text: t.englishText || t.originalText,
    }));

    const turnResult = await this.verificationService.dispatcherTurn(
      nlpResult,
      emotionResult,
      conversationHistory,
      currentSession?.collectedInfo || {},
      currentSession?.infoGatheringTurns || 0,
      currentSession?.verificationAttempts || 0,
      dominantLanguage,
      isCritical,
      currentSession?.conversationPhase || 'verify',
    );

    // Persist updated state — advance phase only when LLM says so
    this.sessionService.update(sessionId, {
      collectedInfo: turnResult.collectedInfo,
      conversationPhase: turnResult.nextPhase,
      infoGatheringTurns: (currentSession?.infoGatheringTurns || 0) + 1,
      verificationAttempts: turnResult.decision === 're-verify'
        ? (currentSession?.verificationAttempts || 0) + 1
        : turnResult.decision === 'proceed'
          ? 0
          : currentSession?.verificationAttempts || 0,
    });

    // ── 6. Route ──────────────────────────────────────────────────────────
    // The LLM decides escalation — we trust its decision.
    // isCritical is passed as context to the LLM; we no longer force
    // critical-escalate here so the verify→gather→ready flow is respected.
    if (turnResult.decision === 'critical-escalate') {
      await this.sendAiResponse(client, sessionId, turnResult.response, dominantLanguage, false);
      await this.escalateToAgent(client, sessionId, 'Critical priority — LLM decision');
      return;
    }

    if (turnResult.decision === 'escalate') {
      await this.sendAiResponse(client, sessionId, turnResult.response, dominantLanguage, false);
      await this.escalateToAgent(client, sessionId, 'Low confidence / max attempts');
      return;
    }

    // proceed or re-verify — send the dispatcher's response
    await this.sendAiResponse(
      client, sessionId, turnResult.response, dominantLanguage,
      turnResult.requiresConfirmation,
      undefined,
      turnResult.decision,
    );

    if (turnResult.decision === 'proceed' && turnResult.infoComplete) {
      this.pushAnalysisToAgent(sessionId);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Emit an AI response to the citizen and add it to the transcript.
   * For non-English responses, also stores an English translation so the
   * agent dashboard can show both the original language and English side-by-side.
   */
  private async sendAiResponse(
    client: Socket,
    sessionId: string,
    text: string,
    language: string,
    requiresConfirmation: boolean,
    precomputedAudio?: Buffer,
    verificationDecision?: string,
    audioMimeType?: string,
  ) {
    let audio: Buffer | undefined = precomputedAudio;
    let mimeType: string | undefined = audioMimeType;

    // Run TTS and English translation in parallel — they're independent
    const [ttsResult, englishText] = await Promise.all([
      audio ? Promise.resolve({ buffer: audio, mimeType: audioMimeType }) : this.responseService.textToSpeech(text, language),
      language === 'en' ? Promise.resolve(text) : this.sttService.translateToEnglish(text, language),
    ]);

    if (!audio && ttsResult) {
      audio  = ttsResult.buffer;
      mimeType = ttsResult.mimeType;
    }

    const aiTranscriptId = `t_ai_${Date.now()}`;
    if (audio && mimeType) {
      this.audioStore.save(aiTranscriptId, audio, mimeType, sessionId);
    }
    const aiAudioUrl = (AUDIO_PLAYBACK_ENABLED && audio) ? `/audio/${aiTranscriptId}` : undefined;

    this.sessionService.addTranscript(sessionId, {
      id: aiTranscriptId,
      speaker: 'ai',
      originalText: text,
      englishText,
      language,
      timestamp: new Date(),
      audioUrl: aiAudioUrl,
    });
    this.emitToAgent(sessionId, 'live_transcript', {
      sessionId,
      transcript: {
        id: aiTranscriptId,
        speaker: 'ai',
        originalText: text,
        englishText,
        language,
        timestamp: new Date(),
        audioUrl: aiAudioUrl,
      },
    });

    client.emit('ai_response', {
      text,
      audio: audio?.toString('base64'),
      audioMimeType: mimeType,
      language,
      requiresConfirmation,
      verificationDecision,
      useBrowserTTS: false,
    });
  }

  private async escalateToAgent(client: Socket, sessionId: string, reason: string) {
    this.sessionService.update(sessionId, { status: 'escalated' });
    client.emit('escalate_to_agent', {
      sessionId,
      message: 'Connecting you to a human agent...',
    });

    const session = this.sessionService.findById(sessionId);
    if (!session) return;

    // ── Determine agent type from full conversation context ───────────────
    // This is the ONLY place agentType is set — at escalation time,
    // using everything the AI gathered during the conversation.
    const conversationHistory = session.transcripts.map(t => ({
      speaker: t.speaker as 'citizen' | 'ai',
      text: t.englishText || t.originalText,
    }));

    const agentType = await this.verificationService.determineAgentType(
      conversationHistory,
      session.collectedInfo || {},
      session.summary || '',
      session.keywords || [],
      session.priority,
    );

    this.sessionService.update(sessionId, { agentType });

    this.server.to('agents').emit('escalation_alert', {
      sessionId,
      reason,
      session: { ...session, agentType },
      priority: session.priority,
      agentType,
    });
    this.logger.warn(`Session ${sessionId} escalated: ${reason} | agentType: ${agentType}`);
  }

  private pushAnalysisToAgent(sessionId: string) {
    const session = this.sessionService.findById(sessionId);
    if (!session) return;
    this.server.to('agents').emit('analysis_ready', {
      sessionId,
      session,
      transcripts: session.transcripts,
      emotionHistory: session.emotionHistory,
      summary: session.summary,
      keywords: session.keywords,
      priority: session.priority,
    });
  }

  private emitToAgent(sessionId: string, event: string, data: any) {
    const session = this.sessionService.findById(sessionId);
    if (session?.agentSocketId) {
      this.server.to(session.agentSocketId).emit(event, data);
    } else {
      this.server.to('agents').emit(event, data);
    }
  }
}
