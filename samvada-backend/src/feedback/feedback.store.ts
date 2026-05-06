import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeedbackEntity } from '../database/entities/feedback.entity';

export interface FeedbackEntry {
  id: string;
  timestamp: Date;
  source: 'citizen' | 'agent';
  feedbackType: 'correct' | 'partial' | 'incorrect' | 'override';
  originalInterpretation: string;
  correctedInterpretation?: string;
  citizenMessage: string;
  language: string;
  intent?: string;
  notes?: string;
}

@Injectable()
export class FeedbackStore {
  private readonly logger = new Logger(FeedbackStore.name);

  /** In-memory cache for fast few-shot example retrieval during LLM calls */
  private entries: FeedbackEntry[] = [];
  private readonly MAX_ENTRIES = 200;

  constructor(
    @InjectRepository(FeedbackEntity)
    private feedbackRepo: Repository<FeedbackEntity>,
  ) {}

  add(entry: Omit<FeedbackEntry, 'id' | 'timestamp'>): FeedbackEntry {
    const full: FeedbackEntry = {
      ...entry,
      id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date(),
    };

    // Update in-memory cache
    this.entries.push(full);
    if (this.entries.length > this.MAX_ENTRIES) {
      this.entries = this.entries.slice(-this.MAX_ENTRIES);
    }

    // Persist to DB asynchronously
    this.persistFeedback(full).catch((err) =>
      this.logger.error(`Failed to persist feedback ${full.id}: ${err.message}`),
    );

    this.logger.log(
      `Feedback stored | source: ${full.source} | type: ${full.feedbackType} | total: ${this.entries.length}`,
    );
    return full;
  }

  /**
   * Return the most recent N incorrect/partial/override entries as few-shot
   * examples for LLM prompts.
   */
  getExamples(limit = 5): FeedbackEntry[] {
    return this.entries
      .filter((e) => e.feedbackType !== 'correct')
      .slice(-limit);
  }

  /**
   * Build a compact string block to inject into LLM system prompts.
   */
  buildExampleBlock(limit = 5): string {
    const examples = this.getExamples(limit);
    if (examples.length === 0) return '';

    const lines = examples.map((e) => {
      const correction = e.correctedInterpretation
        ? ` → Correct: "${e.correctedInterpretation}"`
        : '';
      return `- Citizen said: "${e.citizenMessage}" | AI interpreted: "${e.originalInterpretation}"${correction} [${e.feedbackType}]`;
    });

    return `\nPAST CORRECTIONS (learn from these):\n${lines.join('\n')}\n`;
  }

  getAll(): FeedbackEntry[] {
    return [...this.entries];
  }

  getStats() {
    const total = this.entries.length;
    const byType = this.entries.reduce<Record<string, number>>((acc, e) => {
      acc[e.feedbackType] = (acc[e.feedbackType] || 0) + 1;
      return acc;
    }, {});
    return { total, byType };
  }

  /**
   * Load recent feedback from DB into the in-memory cache on startup.
   * This ensures the LLM has examples even after a server restart.
   */
  async loadFromDb(): Promise<void> {
    try {
      const rows = await this.feedbackRepo.find({
        where: [
          { feedbackType: 'incorrect' },
          { feedbackType: 'partial' },
          { feedbackType: 'override' },
        ],
        order: { timestamp: 'DESC' },
        take: this.MAX_ENTRIES,
      });

      this.entries = rows
        .reverse() // oldest first so slice(-N) returns most recent
        .map((r) => ({
          id: r.id,
          timestamp: r.timestamp,
          source: r.source,
          feedbackType: r.feedbackType,
          originalInterpretation: r.originalInterpretation,
          correctedInterpretation: r.correctedInterpretation,
          citizenMessage: r.citizenMessage,
          language: r.language,
          intent: r.intent,
          notes: r.notes,
        }));

      this.logger.log(`Loaded ${this.entries.length} feedback entries from DB`);
    } catch (err) {
      this.logger.error(`Failed to load feedback from DB: ${err.message}`);
    }
  }

  // ─── DB helper ─────────────────────────────────────────────────────────────

  private async persistFeedback(entry: FeedbackEntry): Promise<void> {
    await this.feedbackRepo.save({
      id: entry.id,
      source: entry.source,
      feedbackType: entry.feedbackType,
      originalInterpretation: entry.originalInterpretation,
      correctedInterpretation: entry.correctedInterpretation,
      citizenMessage: entry.citizenMessage,
      language: entry.language,
      intent: entry.intent,
      notes: entry.notes,
      timestamp: entry.timestamp,
    });
  }
}
