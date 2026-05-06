import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private supabase: SupabaseClient;
  private readonly BUCKET = 'samvada-audio';

  constructor(private config: ConfigService) {
    this.supabase = createClient(
      this.config.get<string>('SUPABASE_URL')!,
      this.config.get<string>('SUPABASE_SERVICE_KEY')!,
    );
  }

  /**
   * Upload an audio buffer to Supabase Storage.
   * Returns the storage path on success, null on failure.
   */
  async upload(
    sessionId: string,
    transcriptId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string | null> {
    const ext  = this.mimeToExt(mimeType);
    const path = `${sessionId}/${transcriptId}.${ext}`;

    try {
      const { error } = await this.supabase.storage
        .from(this.BUCKET)
        .upload(path, buffer, { contentType: mimeType, upsert: false });

      if (error) {
        if ((error as any).statusCode === '409' || error.message?.includes('already exists')) {
          return path; // idempotent
        }
        this.logger.error(`Storage upload failed for ${path}: ${error.message}`);
        return null;
      }

      this.logger.log(`Audio uploaded: ${path} (${buffer.length} bytes)`);
      return path;
    } catch (err: any) {
      this.logger.error(`Storage upload exception for ${path}: ${err.message}`);
      return null;
    }
  }

  /**
   * Generate a signed URL valid for 1 hour.
   */
  async getSignedUrl(storagePath: string, expiresInSeconds = 3600): Promise<string | null> {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.BUCKET)
        .createSignedUrl(storagePath, expiresInSeconds);

      if (error || !data?.signedUrl) {
        this.logger.error(`Failed to sign URL for ${storagePath}: ${error?.message}`);
        return null;
      }
      return data.signedUrl;
    } catch (err: any) {
      this.logger.error(`Sign URL exception for ${storagePath}: ${err.message}`);
      return null;
    }
  }

  /**
   * Upload all audio entries for a session in parallel (called on call close).
   * Returns a map of transcriptId → storage path.
   */
  async uploadSessionAudio(
    sessionId: string,
    audioEntries: Array<{ transcriptId: string; buffer: Buffer; mimeType: string }>,
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    await Promise.all(
      audioEntries.map(async ({ transcriptId, buffer, mimeType }) => {
        const path = await this.upload(sessionId, transcriptId, buffer, mimeType);
        if (path) results.set(transcriptId, path);
      }),
    );

    this.logger.log(
      `Session ${sessionId}: uploaded ${results.size}/${audioEntries.length} audio files`,
    );
    return results;
  }

  /**
   * Delete all audio files for a session from Supabase Storage.
   * Lists all files under {sessionId}/ then removes them in one batch call.
   * Returns the number of files deleted.
   */
  async deleteSessionAudio(sessionId: string): Promise<number> {
    try {
      const { data: files, error: listErr } = await this.supabase.storage
        .from(this.BUCKET)
        .list(sessionId);

      if (listErr) {
        this.logger.warn(`Could not list audio for ${sessionId}: ${listErr.message}`);
        return 0;
      }

      if (!files || files.length === 0) return 0;

      const paths = files.map(f => `${sessionId}/${f.name}`);
      const { error: delErr } = await this.supabase.storage
        .from(this.BUCKET)
        .remove(paths);

      if (delErr) {
        this.logger.error(`Failed to delete audio for ${sessionId}: ${delErr.message}`);
        return 0;
      }

      this.logger.log(`Deleted ${paths.length} audio files for session ${sessionId}`);
      return paths.length;
    } catch (err: any) {
      this.logger.error(`deleteSessionAudio exception for ${sessionId}: ${err.message}`);
      return 0;
    }
  }

  private mimeToExt(mimeType: string): string {
    if (mimeType.includes('wav'))  return 'wav';
    if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return 'mp3';
    if (mimeType.includes('mp4')) return 'mp4';
    if (mimeType.includes('ogg')) return 'ogg';
    return 'webm';
  }
}
