import { Injectable, Logger } from '@nestjs/common';
import type { LlmUsageSnapshot, LlmUsageSource } from '../../contracts/llm/llm-token-usage';
import {
  LlmTokenUsageRepository,
  type LlmTokenUsageInsert,
  type LlmUsageTimeRange,
} from './llm-token-usage.repository';

@Injectable()
export class LlmTokenUsageService {
  private readonly logger = new Logger(LlmTokenUsageService.name);

  constructor(private readonly repo: LlmTokenUsageRepository) {}

  record(row: LlmTokenUsageInsert): void {
    if (row.usage.totalTokens <= 0 && row.usage.promptTokens <= 0) {
      return;
    }
    void this.repo.insert(row).catch((err) => {
      this.logger.warn({
        msg: 'llm_token_usage_record_failed',
        userId: row.userId,
        source: row.source,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  async recordAsync(row: LlmTokenUsageInsert): Promise<void> {
    try {
      await this.repo.insert(row);
    } catch (err) {
      this.logger.warn({
        msg: 'llm_token_usage_record_failed',
        userId: row.userId,
        source: row.source,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  getPlatformSummary(range: LlmUsageTimeRange) {
    return this.repo.getPlatformSummary(range);
  }

  listUsersUsage(params: {
    q?: string;
    limit: number;
    offset: number;
    range: LlmUsageTimeRange;
  }) {
    return this.repo.listUsersUsage(params);
  }

  getUserStats(userId: string, range: LlmUsageTimeRange) {
    return this.repo.getUserStats(userId, range);
  }
}

export type { LlmUsageTimeRange, LlmTokenUsageInsert };
export type { LlmUsageSource, LlmUsageSnapshot };
