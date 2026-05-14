import { Injectable, Logger } from '@nestjs/common';
import type { IntentResult } from '../../contracts/index';
import { LlmGatewayService } from '../../common/llm/llm-gateway.service';

const DEFAULT_SUGGESTIONS = ['填写基础信息', '添加工作经历', '查看简历预览'];

export interface IntentDispatchResult {
  intentResult: IntentResult;
  isLowConfidence: boolean;
  suggestions: string[];
}

@Injectable()
export class IntentDispatcherService {
  private readonly logger = new Logger(IntentDispatcherService.name);

  constructor(private readonly llmGateway: LlmGatewayService) {}

  async dispatch(input: {
    userMessage: string;
    sessionId: string;
    requestId: string;
    confidenceThreshold: number;
    resumeSummary?: string;
  }): Promise<IntentDispatchResult> {
    const result = await this.llmGateway.dispatchIntent({
      userMessage: input.userMessage,
      sessionId: input.sessionId,
      requestId: input.requestId,
      resumeSummary: input.resumeSummary,
    });

    const isLowConfidence = result.confidence < input.confidenceThreshold;

    if (isLowConfidence) {
      this.logger.log({
        msg: 'low_confidence_intent',
        requestId: input.requestId,
        sessionId: input.sessionId,
        intent: result.intent,
        confidence: result.confidence,
      });
    }

    return {
      intentResult: result,
      isLowConfidence,
      suggestions: isLowConfidence ? this.generateSuggestions(result) : [],
    };
  }

  private generateSuggestions(_result: IntentResult): string[] {
    return [...DEFAULT_SUGGESTIONS];
  }
}
