import OpenAI from 'openai';
import {
  intentResultSchema,
  type IntentResult,
} from '../../../contracts/index';
import { Logger } from '@nestjs/common';
import type { EnvConfig } from '../../../config/env.schema';
import type {
  ILlmGateway,
  IntentDispatchInput,
  StreamChatInput,
} from '../llm-gateway.interface';
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
    try {
      const response = await this.client.chat.completions.create(
        {
          model: this.intentModel,
          messages: [
            {
              role: 'system',
              content: buildIntentSystemPrompt(
                this.confidenceThreshold,
                input.resumeSummary,
              ),
            },
            { role: 'user', content: input.userMessage },
          ],
          tools: [{ type: 'function', function: INTENT_FUNCTION_SCHEMA }],
          tool_choice: {
            type: 'function',
            function: { name: INTENT_FUNCTION_SCHEMA.name },
          },
        },
        { signal: input.signal },
      );

      const toolCall = response.choices[0]?.message?.tool_calls?.[0];
      let raw: unknown;

      if (toolCall?.type === 'function' && toolCall.function.arguments) {
        try {
          raw = JSON.parse(toolCall.function.arguments);
        } catch {
          throw new Error('invalid tool arguments json');
        }
      } else {
        const content = response.choices[0]?.message?.content ?? '';
        try {
          raw = JSON.parse(content);
        } catch {
          throw new Error('invalid response content json');
        }
      }

      const result = intentResultSchema.parse(raw);

      this.logger.log({
        msg: 'intent_dispatch_success',
        requestId: input.requestId,
        sessionId: input.sessionId,
        intent: result.intent,
        confidence: result.confidence,
        latencyMs: Date.now() - start,
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
      });

      return result;
    } catch (err) {
      this.logger.error({
        msg: 'intent_dispatch_error',
        requestId: input.requestId,
        sessionId: input.sessionId,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - start,
      });
      throw err;
    }
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
