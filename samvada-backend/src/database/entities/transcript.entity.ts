import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SessionEntity } from './session.entity';

@Entity('transcripts')
export class TranscriptEntity {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id: string;

  @Column({ type: 'varchar', length: 100 })
  sessionId: string;

  @ManyToOne(() => SessionEntity, (s) => s.transcripts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: SessionEntity;

  @Column({ type: 'varchar', length: 20 })
  speaker: 'citizen' | 'ai';

  @Column({ type: 'text' })
  originalText: string;

  @Column({ type: 'text', nullable: true })
  englishText?: string;

  @Column({ type: 'varchar', length: 20 })
  language: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  audioUrl?: string;

  @CreateDateColumn()
  timestamp: Date;
}
