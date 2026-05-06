import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { TranscriptEntity } from './transcript.entity';
import { FeedbackEntity } from './feedback.entity';

@Entity('sessions')
export class SessionEntity {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  sessionId: string;

  @Column({ type: 'varchar', length: 100 })
  citizenSocketId: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  agentSocketId?: string;

  @Column({ type: 'varchar', length: 10, default: 'en' })
  language: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: string;

  @Column({ type: 'varchar', length: 20, default: 'low' })
  priority: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  agentType?: string;

  @Column({ type: 'varchar', length: 20, default: 'verify' })
  conversationPhase: string;

  @Column({ type: 'int', default: 0 })
  verificationAttempts: number;

  @Column({ type: 'int', default: 0 })
  infoGatheringTurns: number;

  @Column({ type: 'text', nullable: true })
  summary?: string;

  @Column({ type: 'jsonb', nullable: true })
  keywords?: string[];

  @Column({ type: 'jsonb', nullable: true })
  location?: { lat: number; lng: number; readable?: string };

  @Column({ type: 'jsonb', default: '{}' })
  languageCounts: Record<string, number>;

  @Column({ type: 'jsonb', default: '{}' })
  collectedInfo: Record<string, string>;

  @Column({ type: 'jsonb', nullable: true })
  emotionHistory?: Array<{
    timestamp: Date;
    emotion: string;
    score: number;
    urgency: number;
  }>;

  @CreateDateColumn()
  startTime: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endTime?: Date;

  @OneToMany(() => TranscriptEntity, (t) => t.session, { cascade: true })
  transcripts: TranscriptEntity[];

  @OneToMany(() => FeedbackEntity, (f) => f.session, { cascade: true })
  feedbackEntries: FeedbackEntity[];
}
