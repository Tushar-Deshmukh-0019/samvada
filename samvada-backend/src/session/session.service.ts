import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionEntity } from '../database/entities/session.entity';
import { TranscriptEntity } from '../database/entities/transcript.entity';

export interface Session {
  sessionId: string;
  citizenSocketId: string;
  agentSocketId?: string;
  language: string;
  transcripts: TranscriptEntry[];
  emotionHistory: EmotionEntry[];
  verificationAttempts: number;
  status: 'active' | 'verifying' | 'escalated' | 'closed';
  priority: 'critical' | 'moderate' | 'low';
  startTime: Date;
  location?: { lat: number; lng: number; readable?: string };
  summary?: string;
  keywords?: string[];
  languageCounts: Record<string, number>;
  collectedInfo: Record<string, string>;
  infoGatheringTurns: number;
  conversationPhase: 'verify' | 'gather' | 'ready';
  agentType?: 'police' | 'ambulance' | 'fire' | 'general';
}

export interface TranscriptEntry {
  id: string;
  speaker: 'citizen' | 'ai';
  originalText: string;
  englishText?: string;
  language: string;
  timestamp: Date;
  audioUrl?: string;
}

export interface EmotionEntry {
  timestamp: Date;
  emotion: string;
  score: number;
  urgency: number;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  /** In-memory store — all hot-path reads/writes go here, zero DB latency */
  private sessions = new Map<string, Session>();

  constructor(
    @InjectRepository(SessionEntity)
    private sessionRepo: Repository<SessionEntity>,
    @InjectRepository(TranscriptEntity)
    private transcriptRepo: Repository<TranscriptEntity>,
  ) {}

  // ─── Public API ────────────────────────────────────────────────────────────

  create(citizenSocketId: string): Session {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session: Session = {
      sessionId,
      citizenSocketId,
      language: 'en',
      transcripts: [],
      emotionHistory: [],
      verificationAttempts: 0,
      status: 'active',
      priority: 'low',
      startTime: new Date(),
      languageCounts: {},
      collectedInfo: {},
      infoGatheringTurns: 0,
      conversationPhase: 'verify',
    };
    this.sessions.set(sessionId, session);

    // Persist initial row async — never blocks the caller
    this.persistSession(session).catch((err) =>
      this.logger.error(`Failed to persist new session ${sessionId}: ${err.message}`),
    );

    return session;
  }

  findBySocketId(socketId: string): Session | undefined {
    for (const session of this.sessions.values()) {
      if (
        session.citizenSocketId === socketId ||
        session.agentSocketId === socketId
      ) {
        return session;
      }
    }
    return undefined;
  }

  findById(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  update(sessionId: string, updates: Partial<Session>): Session | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    const updated = { ...session, ...updates };
    this.sessions.set(sessionId, updated);

    // Persist metadata changes async
    this.persistSession(updated).catch((err) =>
      this.logger.error(`Failed to update session ${sessionId}: ${err.message}`),
    );

    return updated;
  }

  addTranscript(sessionId: string, entry: TranscriptEntry): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.transcripts.push(entry);
      // Persist transcript row async
      this.persistTranscript(sessionId, entry).catch((err) =>
        this.logger.error(`Failed to persist transcript ${entry.id}: ${err.message}`),
      );
    }
  }

  addEmotion(sessionId: string, entry: EmotionEntry): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.emotionHistory.push(entry);
      // Emotion history is stored as JSONB on the session row.
      // It will be flushed on the next persistSession call (update/close).
    }
  }

  assignAgent(sessionId: string, agentSocketId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.agentSocketId = agentSocketId;
      this.persistSession(session).catch((err) =>
        this.logger.error(`Failed to persist agent assignment for ${sessionId}: ${err.message}`),
      );
    }
  }

  recordLanguage(sessionId: string, rawLang: string, wordCount: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const lang = this.normaliseLanguage(rawLang);
    session.languageCounts[lang] = (session.languageCounts[lang] || 0) + wordCount;
    session.language = this.computeDominant(session.languageCounts);
  }

  getDominantLanguage(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session || Object.keys(session.languageCounts).length === 0) return 'en';
    return this.computeDominant(session.languageCounts);
  }

  normaliseLanguage(raw: string): string {
    const lower = (raw || '').toLowerCase().trim();
    if (lower === 'kannada' || lower === 'kn') return 'kn';
    if (lower === 'hindi'   || lower === 'hi') return 'hi';
    if (lower === 'english' || lower === 'en') return 'en';
    return 'en';
  }

  private computeDominant(counts: Record<string, number>): string {
    let dominant = 'en';
    let max = 0;
    for (const [lang, count] of Object.entries(counts)) {
      if (count > max) { max = count; dominant = lang; }
    }
    return dominant;
  }

  getAll(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Mark session as closed and do a final DB flush with endTime.
   * Audio flushing to Supabase Storage is handled by the gateway
   * (which has access to AudioStore) — see websocket.gateway.ts.
   */
  close(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'closed';
      // Final flush — includes emotion history and endTime
      this.persistSession(session, new Date()).catch((err) =>
        this.logger.error(`Failed to close session ${sessionId}: ${err.message}`),
      );
    }
  }

  // ─── DB helpers ────────────────────────────────────────────────────────────

  /**
   * Upsert the session row.
   * Emotion history is stored as JSONB so it's always current on close.
   */
  private async persistSession(session: Session, endTime?: Date): Promise<void> {
    await this.sessionRepo.save({
      sessionId:            session.sessionId,
      citizenSocketId:      session.citizenSocketId,
      agentSocketId:        session.agentSocketId,
      language:             session.language,
      status:               session.status,
      priority:             session.priority,
      agentType:            session.agentType,
      conversationPhase:    session.conversationPhase,
      verificationAttempts: session.verificationAttempts,
      infoGatheringTurns:   session.infoGatheringTurns,
      summary:              session.summary,
      keywords:             session.keywords,
      location:             session.location,
      languageCounts:       session.languageCounts,
      collectedInfo:        session.collectedInfo,
      emotionHistory:       session.emotionHistory,
      startTime:            session.startTime,
      endTime:              endTime ?? undefined,
    });
  }

  /** Insert a single transcript row. Idempotent via PK. */
  private async persistTranscript(
    sessionId: string,
    entry: TranscriptEntry,
  ): Promise<void> {
    await this.transcriptRepo.save({
      id:           entry.id,
      sessionId,
      speaker:      entry.speaker,
      originalText: entry.originalText,
      englishText:  entry.englishText,
      language:     entry.language,
      audioUrl:     entry.audioUrl,
      timestamp:    entry.timestamp,
    });
  }
}
