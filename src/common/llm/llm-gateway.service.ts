import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ResumeAgentTurn } from './resume-agent-response-parse';
import { CHAT_INTENTS } from '../../contracts/constants/chat-intents';
import { TURN_OUTCOMES } from '../../contracts/llm/resume-agent-meta';
import {
  ILlmGateway,
  LLM_GATEWAY,
  type ResumeAgentDispatchInput,
} from './llm-gateway.interface';
import { parseEnv } from '../../config/env.schema';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const FALLBACK_RESUME_AGENT_TURN: ResumeAgentTurn = {
  responseText: '',
  meta: {
    outcome: TURN_OUTCOMES.CHAT_ONLY,
    intent: CHAT_INTENTS.GENERAL_CHAT,
    confidence: 0.5,
  },
  mutationCalls: [],
  uiActions: [],
};

@Injectable()
export class LlmGatewayService {
  private readonly logger = new Logger(LlmGatewayService.name);
  private readonly firstByteTimeout: number;
  readonly providerName: string;
  readonly llmDebug: boolean;

  constructor(@Inject(LLM_GATEWAY) private readonly provider: ILlmGateway) {
    const env = parseEnv(process.env);
    this.providerName = env.LLM_PROVIDER;
    this.llmDebug = env.LLM_DEBUG;
    this.firstByteTimeout = env.LLM_FIRST_BYTE_TIMEOUT_MS;
  }

  async dispatchResumeAgent(
    input: ResumeAgentDispatchInput,
  ): Promise<ResumeAgentTurn> {
    let lastError = 'unknown';

    const tryOnce = async (): Promise<ResumeAgentTurn> => {
      const abortCtrl = new AbortController();
      const timer = setTimeout(() => abortCtrl.abort(), this.firstByteTimeout);
      try {
        const raw = await this.provider.dispatchResumeAgent({
          ...input,
          signal: abortCtrl.signal,
        });
        clearTimeout(timer);
        return raw;
      } catch (err) {
        clearTimeout(timer);
        lastError = errorMessage(err);
        throw new Error(`resume agent dispatch failed: ${lastError}`);
      }
    };

    this.logger.log({
      msg: 'resume_agent_dispatch_start',
      provider: this.providerName,
      requestId: input.requestId,
      sessionId: input.sessionId,
      userMessagePreview: input.userMessage.slice(0, 80),
    });

    try {
      return await tryOnce();
    } catch (err) {
      this.logger.warn({
        msg: 'resume_agent_dispatch_retry',
        provider: this.providerName,
        requestId: input.requestId,
        sessionId: input.sessionId,
        error: errorMessage(err),
      });
    }

    try {
      return await tryOnce();
    } catch (err) {
      this.logger.error({
        msg: 'resume_agent_dispatch_fallback',
        provider: this.providerName,
        requestId: input.requestId,
        sessionId: input.sessionId,
        error: errorMessage(err),
        lastProviderError: lastError,
      });
      return FALLBACK_RESUME_AGENT_TURN;
    }
  }
}
