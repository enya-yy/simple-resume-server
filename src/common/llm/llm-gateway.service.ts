import { Inject, Injectable, Logger } from '@nestjs/common';
import { intentResultSchema, type IntentResult } from '../../contracts/index';
import {
  ILlmGateway,
  LLM_GATEWAY,
  type IntentDispatchInput,
  type StreamChatInput,
} from './llm-gateway.interface';
import { parseEnv } from '../../config/env.schema';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

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
  readonly providerName: string;
  readonly llmDebug: boolean;

  constructor(@Inject(LLM_GATEWAY) private readonly provider: ILlmGateway) {
    const env = parseEnv(process.env);
    this.providerName = env.LLM_PROVIDER;
    this.llmDebug = env.LLM_DEBUG;
    this.firstByteTimeout = env.LLM_FIRST_BYTE_TIMEOUT_MS;
    this.streamIdleTimeout = env.LLM_STREAM_IDLE_TIMEOUT_MS;
    this.streamMaxDuration = env.LLM_STREAM_MAX_DURATION_MS;
  }

  async dispatchIntent(input: IntentDispatchInput): Promise<IntentResult> {
    let lastError = 'unknown';

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
      } catch (err) {
        clearTimeout(timer);
        lastError = errorMessage(err);
        throw new Error(`intent dispatch failed: ${lastError}`);
      }
    };

    this.logger.log({
      msg: 'intent_dispatch_start',
      provider: this.providerName,
      requestId: input.requestId,
      sessionId: input.sessionId,
      userMessagePreview: input.userMessage.slice(0, 80),
    });

    try {
      const result = await tryOnce();
      this.logger.log({
        msg: 'intent_dispatch_success',
        provider: this.providerName,
        requestId: input.requestId,
        sessionId: input.sessionId,
        intent: result.intent,
        confidence: result.confidence,
        responseTextPreview: result.responseText?.slice(0, 80),
      });
      return result;
    } catch (err) {
      this.logger.warn({
        msg: 'intent_dispatch_retry',
        provider: this.providerName,
        requestId: input.requestId,
        sessionId: input.sessionId,
        error: errorMessage(err),
        lastProviderError: lastError,
      });
    }

    try {
      const result = await tryOnce();
      this.logger.log({
        msg: 'intent_dispatch_success',
        provider: this.providerName,
        requestId: input.requestId,
        sessionId: input.sessionId,
        intent: result.intent,
        confidence: result.confidence,
        responseTextPreview: result.responseText?.slice(0, 80),
        retried: true,
      });
      return result;
    } catch (err) {
      this.logger.error({
        msg: 'intent_dispatch_fallback',
        provider: this.providerName,
        requestId: input.requestId,
        sessionId: input.sessionId,
        error: errorMessage(err),
        lastProviderError: lastError,
        fallbackResponseText: FALLBACK_RESULT.responseText,
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

    this.logger.log({
      msg: 'stream_chat_start',
      provider: this.providerName,
      requestId: input.requestId,
      sessionId: input.sessionId,
      messageCount: input.messages.length,
      systemPromptPreview: input.messages.find((m) => m.role === 'system')
        ?.content
        ?.slice(0, 120),
    });

    try {
      await this.provider.streamChat({
        ...input,
        signal: ac.signal,
        onToken: async (text) => {
          if (!gotFirstByte) {
            gotFirstByte = true;
            clearTimeout(firstByteTimer);
            this.logger.log({
              msg: 'stream_chat_first_token',
              provider: this.providerName,
              requestId: input.requestId,
              sessionId: input.sessionId,
              tokenPreview: text.slice(0, 40),
            });
          }
          resetIdle();
          await input.onToken(text);
        },
        onDone: async () => {
          await input.onDone();
        },
      });
      this.logger.log({
        msg: 'stream_chat_done',
        provider: this.providerName,
        requestId: input.requestId,
        sessionId: input.sessionId,
        gotFirstByte,
      });
    } catch (err) {
      this.logger.error({
        msg: 'stream_chat_error',
        provider: this.providerName,
        requestId: input.requestId,
        sessionId: input.sessionId,
        gotFirstByte,
        error: errorMessage(err),
        abortedReason:
          ac.signal.reason != null ? String(ac.signal.reason) : undefined,
      });
      throw err;
    } finally {
      clearTimeout(maxTimer);
      clearTimeout(firstByteTimer);
      if (idleTimer) clearTimeout(idleTimer);
    }
  }
}
