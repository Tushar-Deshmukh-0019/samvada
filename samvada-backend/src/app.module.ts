import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebsocketModule } from './websocket/websocket.module';
import { SttModule } from './stt/stt.module';
import { EmotionModule } from './emotion/emotion.module';
import { NlpModule } from './nlp/nlp.module';
import { VerificationModule } from './verification/verification.module';
import { ResponseModule } from './response/response.module';
import { SessionModule } from './session/session.module';
import { FeedbackModule } from './feedback/feedback.module';
import { AudioModule } from './audio/audio-playback';
import { DatabaseModule } from './database/database.module';
import { StorageModule } from './storage/storage.module';
import { FeedbackStore } from './feedback/feedback.store';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    StorageModule,
    FeedbackModule,
    SessionModule,
    SttModule,
    EmotionModule,
    NlpModule,
    VerificationModule,
    ResponseModule,
    AudioModule,
    WebsocketModule,
  ],
})
export class AppModule implements OnApplicationBootstrap {
  constructor(private readonly feedbackStore: FeedbackStore) {}

  /**
   * After all modules are initialised and the DB connection is ready,
   * pre-load recent feedback into the in-memory cache so the LLM has
   * few-shot examples from previous sessions immediately on startup.
   */
  async onApplicationBootstrap(): Promise<void> {
    await this.feedbackStore.loadFromDb();
  }
}
