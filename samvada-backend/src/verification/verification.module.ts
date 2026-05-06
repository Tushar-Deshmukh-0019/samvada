import { Module } from '@nestjs/common';
import { VerificationService } from './verification.service';
import { FeedbackModule } from '../feedback/feedback.module';

@Module({
  imports: [FeedbackModule],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}
