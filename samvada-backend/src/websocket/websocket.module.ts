import { Module } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';
import { SttModule } from '../stt/stt.module';
import { EmotionModule } from '../emotion/emotion.module';
import { NlpModule } from '../nlp/nlp.module';
import { VerificationModule } from '../verification/verification.module';
import { ResponseModule } from '../response/response.module';
import { SessionModule } from '../session/session.module';
import { AudioModule } from '../audio/audio-playback';

@Module({
  imports: [
    SttModule,
    EmotionModule,
    NlpModule,
    VerificationModule,
    ResponseModule,
    SessionModule,
    AudioModule,
  ],
  providers: [WebsocketGateway],
})
export class WebsocketModule {}
