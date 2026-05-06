import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeedbackStore } from './feedback.store';
import { FeedbackEntity } from '../database/entities/feedback.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FeedbackEntity])],
  providers: [FeedbackStore],
  exports: [FeedbackStore],
})
export class FeedbackModule {}
