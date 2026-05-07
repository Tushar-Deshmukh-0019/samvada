import { Injectable } from '@nestjs/common';

export interface PriorityResult {
  level: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  reasons: string[];
}

@Injectable()
export class PriorityService {
  analyzePriority(
    transcript: string,
    emotion: string,
    intent: string,
  ): PriorityResult {
    // Default implementation - returns medium priority
    return {
      level: 'medium',
      score: 50,
      reasons: ['Default priority assignment'],
    };
  }
}
