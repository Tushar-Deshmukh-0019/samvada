import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SessionEntity } from './session.entity';

@Entity('feedback')
export class FeedbackEntity {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id: string;

  /** Optional — feedback can exist without a session (e.g. agent corrections) */
  @Column({ type: 'varchar', length: 100, nullable: true })
  sessionId?: string;

  @ManyToOne(() => SessionEntity, (s) => s.feedbackEntries, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'sessionId' })
  session?: SessionEntity;

  @Column({ type: 'varchar', length: 20 })
  source: 'citizen' | 'agent';

  @Column({ type: 'varchar', length: 20 })
  feedbackType: 'correct' | 'partial' | 'incorrect' | 'override';

  @Column({ type: 'text' })
  originalInterpretation: string;

  @Column({ type: 'text', nullable: true })
  correctedInterpretation?: string;

  @Column({ type: 'text' })
  citizenMessage: string;

  @Column({ type: 'varchar', length: 20 })
  language: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  intent?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn()
  timestamp: Date;
}
