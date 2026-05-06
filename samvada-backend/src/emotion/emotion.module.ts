import { Module } from '@nestjs/common';
import { EmotionService } from './emotion.service';

@Module({
  providers: [EmotionService],
  exports: [EmotionService],
})
export class EmotionModule {}
