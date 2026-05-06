import { Controller, Get, Delete, Param, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionEntity } from '../database/entities/session.entity';
import { TranscriptEntity } from '../database/entities/transcript.entity';
import { StorageService } from '../storage/storage.service';

@Controller('sessions')
export class SessionController {
  constructor(
    @InjectRepository(SessionEntity)
    private sessionRepo: Repository<SessionEntity>,
    @InjectRepository(TranscriptEntity)
    private transcriptRepo: Repository<TranscriptEntity>,
    private storageService: StorageService,
  ) {}

  /**
   * GET /sessions/history
   * Returns paginated past sessions with summary stats.
   * Query params: page (default 1), limit (default 20), status, priority, agentType
   */
  @Get('history')
  async getHistory(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('agentType') agentType?: string,
  ) {
    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip     = (pageNum - 1) * limitNum;

    const qb = this.sessionRepo.createQueryBuilder('s')
      .orderBy('s.startTime', 'DESC')
      .skip(skip)
      .take(limitNum);

    if (status)    qb.andWhere('s.status = :status', { status });
    if (priority)  qb.andWhere('s.priority = :priority', { priority });
    if (agentType) qb.andWhere('s.agentType = :agentType', { agentType });

    const [sessions, total] = await qb.getManyAndCount();

    return {
      data: sessions,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  /**
   * GET /sessions/stats
   * Returns aggregate stats for the analytics dashboard.
   */
  @Get('stats')
  async getStats() {
    const [total, critical, escalated, closed] = await Promise.all([
      this.sessionRepo.count(),
      this.sessionRepo.count({ where: { priority: 'critical' } }),
      this.sessionRepo.count({ where: { status: 'escalated' } }),
      this.sessionRepo.count({ where: { status: 'closed' } }),
    ]);

    // Agent type breakdown
    const agentTypeRaw = await this.sessionRepo
      .createQueryBuilder('s')
      .select('s.agentType', 'agentType')
      .addSelect('COUNT(*)', 'count')
      .where('s.agentType IS NOT NULL')
      .groupBy('s.agentType')
      .getRawMany();

    // Language breakdown
    const langRaw = await this.sessionRepo
      .createQueryBuilder('s')
      .select('s.language', 'language')
      .addSelect('COUNT(*)', 'count')
      .groupBy('s.language')
      .getRawMany();

    // Average session duration (closed sessions only)
    const durationRaw = await this.sessionRepo
      .createQueryBuilder('s')
      .select('AVG(EXTRACT(EPOCH FROM (s.endTime - s.startTime)))', 'avgSeconds')
      .where('s.endTime IS NOT NULL')
      .getRawOne();

    return {
      total,
      critical,
      escalated,
      closed,
      active: total - closed,
      avgDurationSeconds: Math.round(parseFloat(durationRaw?.avgSeconds ?? '0')),
      agentTypeBreakdown: agentTypeRaw.reduce((acc: Record<string, number>, r) => {
        acc[r.agentType] = parseInt(r.count, 10);
        return acc;
      }, {}),
      languageBreakdown: langRaw.reduce((acc: Record<string, number>, r) => {
        acc[r.language] = parseInt(r.count, 10);
        return acc;
      }, {}),
    };
  }

  /**
   * GET /sessions/history/:sessionId
   * Returns a single session with its full transcripts.
   */
  @Get('history/:sessionId')
  async getSession(@Param('sessionId') sessionId: string) {
    const session = await this.sessionRepo.findOne({ where: { sessionId } });
    if (!session) return { error: 'Session not found' };

    const transcripts = await this.transcriptRepo.find({
      where: { sessionId },
      order: { timestamp: 'ASC' },
    });

    return { ...session, transcripts };
  }

  /**
   * DELETE /sessions/history/:sessionId
   * Deletes a session and everything related to it:
   *   1. All audio files from Supabase Storage (session folder)
   *   2. All transcript rows (cascade from FK, but we also clean storage)
   *   3. The session row itself (transcripts + feedback cascade via FK)
   */
  @Delete('history/:sessionId')
  async deleteSession(@Param('sessionId') sessionId: string) {
    const session = await this.sessionRepo.findOne({ where: { sessionId } });
    if (!session) return { error: 'Session not found' };

    // ── 1. Delete audio files from Supabase Storage ───────────────────────
    // List all files under the session folder then remove them in one call.
    const audioDeleted = await this.storageService.deleteSessionAudio(sessionId);

    // ── 2. Delete DB rows — transcripts + feedback cascade automatically ──
    await this.sessionRepo.delete({ sessionId });

    return {
      success: true,
      sessionId,
      audioFilesDeleted: audioDeleted,
    };
  }
}
