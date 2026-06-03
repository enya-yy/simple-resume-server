import { Global, Module } from '@nestjs/common';
import { LlmTokenUsageRepository } from './llm-token-usage.repository';
import { LlmTokenUsageService } from './llm-token-usage.service';

@Global()
@Module({
  providers: [LlmTokenUsageRepository, LlmTokenUsageService],
  exports: [LlmTokenUsageService, LlmTokenUsageRepository],
})
export class LlmTokenUsageModule {}
