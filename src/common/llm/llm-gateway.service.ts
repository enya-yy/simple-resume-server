import { Inject, Injectable, Logger } from '@nestjs/common';
import { intentResultSchema, type IntentResult } from '../../contracts/index';
import {
  ILlmGateway,
  LLM_GATEWAY,
  type IntentDispatchInput,
  type StreamChatInput,
} from './llm-gateway.interface';
import { parseEnv } from '../../config/env.schema';

const FALLBACK_RESULT: IntentResult = {
  intent: 'GENERAL_CHAT',
  confidence: 0,
  responseText: '你好！我是你的简历助手，有什么可以帮你的吗？',
};

@Injectable()
export class LlmGatewayService {
  private readonly logger = new Logger(LlmGatewayService.name);
  private readonly firstByteTimeout: number;
  private readonly streamIdleTimeout: number;
  private readonly streamMaxDuration: number;

  constructor(@Inject(LLM_GATEWAY) private readonly provider: ILlmGateway) {
    const env = parseEnv(process.env);
    this.firstByteTimeout = env.LLM_FIRST_BYTE_TIMEOUT_MS;
    this.streamIdleTimeout = env.LLM_STREAM_IDLE_TIMEOUT_MS;
    this.streamMaxDuration = env.LLM_STREAM_MAX_DURATION_MS;
  }

  async dispatchIntent(input: IntentDispatchInput): Promise<IntentResult> {
    const tryOnce = async (): Promise<IntentResult> => {
      const abortCtrl = new AbortController();
      const timer = setTimeout(() => abortCtrl.abort(), this.firstByteTimeout);

      try {
        const raw = await this.provider.dispatchIntent({
          ...input,
          signal: abortCtrl.signal,
        });
        clearTimeout(timer);
        return intentResultSchema.parse(raw);
      } catch {
        clearTimeout(timer);
        throw new Error('intent dispatch failed');
      }
    };

    try {
      return await tryOnce();
    } catch {
      this.logger.warn({
        msg: 'intent_dispatch_retry',
        requestId: input.requestId,
        sessionId: input.sessionId,
      });
    }

    try {
      return await tryOnce();
    } catch {
      this.logger.error({
        msg: 'intent_dispatch_fallback',
        requestId: input.requestId,
        sessionId: input.sessionId,
      });
      return FALLBACK_RESULT;
    }
  }

  async streamChat(input: StreamChatInput): Promise<void> {
    const ac = new AbortController();

    const maxTimer = setTimeout(
      () => ac.abort('max_duration'),
      this.streamMaxDuration,
    );

    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(
        () => ac.abort('idle_timeout'),
        this.streamIdleTimeout,
      );
    };

    const firstByteTimer = setTimeout(
      () => ac.abort('first_byte_timeout'),
      this.firstByteTimeout,
    );

    let gotFirstByte = false;

    try {
      await this.provider.streamChat({
        ...input,
        signal: ac.signal,
        onToken: async (text) => {
          if (!gotFirstByte) {
            gotFirstByte = true;
            clearTimeout(firstByteTimer);
          }
          resetIdle();
          await input.onToken(text);
        },
        onDone: async () => {
          await input.onDone();
        },
      });
    } finally {
      clearTimeout(maxTimer);
      clearTimeout(firstByteTimer);
      if (idleTimer) clearTimeout(idleTimer);
    }
  }
}
