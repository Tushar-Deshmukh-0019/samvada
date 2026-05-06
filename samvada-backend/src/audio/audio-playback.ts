/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║              AUDIO PLAYBACK — SINGLE IMPLEMENTATION FILE                ║
 * ║                                                                          ║
 * ║  This file owns the entire audio playback feature.                      ║
 * ║  To toggle the feature, change AUDIO_PLAYBACK_ENABLED below.            ║
 * ║                                                                          ║
 * ║    1  →  ON   (audio stored, /audio/:id endpoint active, play buttons)  ║
 * ║    0  →  OFF  (nothing stored, endpoint returns 404, no play buttons)   ║
 * ║                                                                          ║
 * ║  Nothing else in the codebase needs to change.                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * HOW AUDIO STORAGE WORKS (when ENABLED):
 *
 *  DURING a call  → audio is kept in the in-memory Map (zero latency for playback)
 *  AFTER a call   → SessionService.close() calls flushToStorage() which uploads
 *                   all buffered audio to Supabase Storage and evicts from memory
 *  PLAYBACK       → GET /audio/:id first checks memory (active call), then falls
 *                   back to a Supabase signed URL (closed call)
 */

// ─── FEATURE FLAG ─────────────────────────────────────────────────────────────
export const AUDIO_PLAYBACK_ENABLED: 0 | 1 = 1;
// ─────────────────────────────────────────────────────────────────────────────

import {
  Injectable,
  Controller,
  Get,
  Param,
  Res,
  NotFoundException,
  Module,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { StorageModule } from '../storage/storage.module';
import { StorageService } from '../storage/storage.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StoredAudio {
  buffer: Buffer;
  mimeType: string;
  /** sessionId is stored so we can group uploads by session on flush */
  sessionId?: string;
}

// ─── AudioStore ───────────────────────────────────────────────────────────────
//
//  In-memory store for audio blobs during active calls.
//  Bounded to MAX_ENTRIES (FIFO eviction) to cap memory usage.
//
//  When AUDIO_PLAYBACK_ENABLED = 0:
//    All methods are no-ops / return undefined/false.
//
@Injectable()
export class AudioStore {
  private readonly logger = new Logger(AudioStore.name);
  private readonly MAX_ENTRIES = 500;
  private store = new Map<string, StoredAudio>();
  private queue: string[] = [];

  constructor(private readonly storageService: StorageService) {}

  /**
   * Save audio to the in-memory store during an active call.
   * sessionId is optional but should always be provided so flushToStorage works.
   */
  save(transcriptId: string, buffer: Buffer, mimeType: string, sessionId?: string): void {
    if (!AUDIO_PLAYBACK_ENABLED) return;
    if (this.store.has(transcriptId)) return;

    this.store.set(transcriptId, { buffer, mimeType, sessionId });
    this.queue.push(transcriptId);

    // FIFO eviction — oldest entry is removed when cap is reached
    if (this.queue.length > this.MAX_ENTRIES) {
      const oldest = this.queue.shift();
      if (oldest) this.store.delete(oldest);
    }
  }

  get(transcriptId: string): StoredAudio | undefined {
    if (!AUDIO_PLAYBACK_ENABLED) return undefined;
    return this.store.get(transcriptId);
  }

  has(transcriptId: string): boolean {
    if (!AUDIO_PLAYBACK_ENABLED) return false;
    return this.store.has(transcriptId);
  }

  /**
   * Upload all in-memory audio for a session to Supabase Storage,
   * then evict those entries from memory.
   *
   * Called by SessionService.close() — runs async, never blocks the call flow.
   * Returns a map of transcriptId → storage path for updating transcript rows.
   */
  async flushToStorage(sessionId: string): Promise<Map<string, string>> {
    if (!AUDIO_PLAYBACK_ENABLED) return new Map();

    // Collect all entries belonging to this session
    const toUpload: Array<{ transcriptId: string; buffer: Buffer; mimeType: string }> = [];
    for (const [transcriptId, entry] of this.store.entries()) {
      if (entry.sessionId === sessionId) {
        toUpload.push({ transcriptId, buffer: entry.buffer, mimeType: entry.mimeType });
      }
    }

    if (toUpload.length === 0) return new Map();

    // Upload to Supabase Storage
    const uploaded = await this.storageService.uploadSessionAudio(sessionId, toUpload);

    // Evict uploaded entries from memory
    for (const { transcriptId } of toUpload) {
      this.store.delete(transcriptId);
      const idx = this.queue.indexOf(transcriptId);
      if (idx !== -1) this.queue.splice(idx, 1);
    }

    this.logger.log(
      `Flushed ${uploaded.size}/${toUpload.length} audio entries for session ${sessionId}`,
    );
    return uploaded;
  }

  /**
   * Get a signed URL for an audio file that has been flushed to Storage.
   * Used by the /audio/:id endpoint for closed sessions.
   */
  async getSignedUrl(storagePath: string): Promise<string | null> {
    if (!AUDIO_PLAYBACK_ENABLED) return null;
    return this.storageService.getSignedUrl(storagePath);
  }
}

/* ─── AudioController ──────────────────────────────────────────────────────────
/  GET /audio/:id
//
//  1. Check in-memory store (active call — instant)
//  2. If not found, check if the id looks like a storage path and redirect
//     to a signed Supabase URL (closed call)
//  3. 404 if neither
*/
@Controller('audio')
export class AudioController {
  constructor(private readonly audioStore: AudioStore) {}

  @Get(':id')
  async serve(@Param('id') id: string, @Res() res: Response) {
    // ── 1. In-memory (active call) ────────────────────────────────────────
    const entry = this.audioStore.get(id);
    if (entry) {
      res.set({
        'Content-Type': entry.mimeType,
        'Content-Length': entry.buffer.length.toString(),
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      });
      return res.end(entry.buffer);
    }

    // ── 2. Supabase Storage (closed call) — id IS the storage path ────────
    // Storage paths look like: "session_xxx/t_yyy.webm"
    if (AUDIO_PLAYBACK_ENABLED && id.includes('/')) {
      const signedUrl = await this.audioStore.getSignedUrl(id);
      if (signedUrl) {
        return res.redirect(302, signedUrl);
      }
    }

    throw new NotFoundException(`Audio not found: ${id}`);
  }
}

// ─── AudioModule ──────────────────────────────────────────────────────────────

@Module({
  imports:     [StorageModule],
  providers:   [AudioStore],
  controllers: [AudioController],
  exports:     [AudioStore],
})
export class AudioModule {}
