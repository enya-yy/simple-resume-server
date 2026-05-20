import OpenAI from 'openai';
import type { IntentResult } from '../../../contracts/index';
import { Logger } from '@nestjs/common';
import type { EnvConfig } from '../../../config/env.schema';
import type {
  ILlmGateway,
  IntentDispatchInput,
  StreamChatInput,
} from '../llm-gateway.interface';
import {
  isToolChoiceUnsupportedError,
  parseIntentFromCompletionMessage,
  type IntentDispatchStrategy,
} from '../intent-response-parse';
import {
  buildIntentSystemPrompt,
  INTENT_FUNCTION_SCHEMA,
} from '../prompts/intent-dispatcher.prompt';

export type OpenAiCompatibleLlmCredentials = {
  apiKey: string;
  baseURL: string;
  intentModel: string;
  chatModel: string;
};

const JSON_ONLY_INTENT_SUFFIX =
  '\n\n【输出要求】你必须只输出一个 JSON 对象（与上文格式一致），不要 markdown 代码块，不要其它说明文字。';

/** OpenAI SDK 访问任意 OpenAI 兼容 Chat Completions 端点（百炼、DeepSeek 等）。 */
export class OpenAiCompatibleLlmProvider implements ILlmGateway {
  private readonly client: OpenAI;
  private readonly intentModel: string;
  private readonly chatModel: string;
  private readonly confidenceThreshold: number;
  private readonly logger = new Logger(OpenAiCompatibleLlmProvider.name);

  constructor(
    env: Pick<EnvConfig, 'LLM_CONFIDENCE_THRESHOLD'>,
    creds: OpenAiCompatibleLlmCredentials,
  ) {
    this.client = new OpenAI({
      apiKey: creds.apiKey,
      baseURL: creds.baseURL,
    });
    this.intentModel = creds.intentModel;
    this.chatModel = creds.chatModel;
    this.confidenceThreshold = env.LLM_CONFIDENCE_THRESHOLD;
  }

  async dispatchIntent(input: IntentDispatchInput): Promise<IntentResult> {
    const start = Date.now();
    const baseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: buildIntentSystemPrompt(
          this.confidenceThreshold,
          input.resumeSummary,
        ),
      },
      { role: 'user', content: input.userMessage },
    ];

    const strategies: IntentDispatchStrategy[] = [
      'tool_required',
      'tool_auto',
      'json_content',
    ];

    let lastError: unknown;

    for (let i = 0; i < strategies.length; i++) {
      const strategy = strategies[i]!;
      try {
        const result = await this.runIntentStrategy(
          strategy,
          baseMessages,
          input.signal,
        );

        this.logger.log({
          msg: 'intent_dispatch_success',
          requestId: input.requestId,
          sessionId: input.sessionId,
          intent: result.intent,
          confidence: result.confidence,
          strategy,
          latencyMs: Date.now() - start,
        });

        return result;
      } catch (err) {
        lastError = err;
        if (i >= strategies.length - 1) break;

        this.logger.warn({
          msg: 'intent_dispatch_strategy_fallback',
          requestId: input.requestId,
          sessionId: input.sessionId,
          failedStrategy: strategy,
          nextStrategy: strategies[i + 1],
          toolChoiceUnsupported:
            strategy === 'tool_required' && isToolChoiceUnsupportedError(err),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.logger.error({
      msg: 'intent_dispatch_error',
      requestId: input.requestId,
      sessionId: input.sessionId,
      error: lastError instanceof Error ? lastError.message : String(lastError),
      latencyMs: Date.now() - start,
    });
    throw lastError instanceof Error
      ? lastError
      : new Error(String(lastError ?? 'intent dispatch failed'));
  }

  private async runIntentStrategy(
    strategy: IntentDispatchStrategy,
    baseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    signal?: AbortSignal,
  ): Promise<IntentResult> {
    const tools = [{ type: 'function' as const, function: INTENT_FUNCTION_SCHEMA }];

    let messages = baseMessages;
    let body: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;

    if (strategy === 'tool_required') {
      body = {
        model: this.intentModel,
        messages,
        tools,
        tool_choice: {
          type: 'function',
          function: { name: INTENT_FUNCTION_SCHEMA.name },
        },
      };
    } else if (strategy === 'tool_auto') {
      body = {
        model: this.intentModel,
        messages,
        tools,
        tool_choice: 'auto',
      };
    } else {
      messages = [
        {
          role: 'system',
          content:
            (baseMessages[0] as { role: 'system'; content: string }).content +
            JSON_ONLY_INTENT_SUFFIX,
        },
        baseMessages[1]!,
      ];
      body = {
        model: this.intentModel,
        messages,
      };
    }

    const response = await this.client.chat.completions.create(body, {
      signal,
    });

    return parseIntentFromCompletionMessage(response.choices[0]?.message);
  }

  async streamChat(input: StreamChatInput): Promise<void> {
    const start = Date.now();
    try {
      const stream = await this.client.chat.completions.create({
        model: this.chatModel,
        messages: input.messages,
        stream: true,
      });

      for await (const chunk of stream) {
        if (input.signal?.aborted) break;
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          await input.onToken(delta);
        }
      }

      await input.onDone();

      this.logger.log({
        msg: 'stream_chat_done',
        requestId: input.requestId,
        sessionId: input.sessionId,
        latencyMs: Date.now() - start,
      });
    } catch (err) {
      this.logger.error({
        msg: 'stream_chat_error',
        requestId: input.requestId,
        sessionId: input.sessionId,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - start,
      });
      throw err;
    }
  }
}
