import OpenAI from 'openai';
import { Logger } from '@nestjs/common';
import type { EnvConfig } from '../../../config/env.schema';
import type {
  ILlmGateway,
  ResumeAgentDispatchInput,
} from '../llm-gateway.interface';
import { parseResumeAgentTurn } from '../resume-agent-response-parse';
import {
  buildResumeAgentSystemPrompt,
  RESUME_AGENT_TOOLS,
} from '../prompts/resume-agent.prompt';

export type OpenAiCompatibleLlmCredentials = {
  apiKey: string;
  baseURL: string;
  intentModel: string;
  chatModel: string;
};

/** OpenAI SDK 访问任意 OpenAI 兼容 Chat Completions 端点（百炼、DeepSeek 等）。 */
export class OpenAiCompatibleLlmProvider implements ILlmGateway {
  private readonly client: OpenAI;
  private readonly agentModel: string;
  private readonly logger = new Logger(OpenAiCompatibleLlmProvider.name);

  constructor(
    _env: Pick<EnvConfig, 'LLM_CONFIDENCE_THRESHOLD'>,
    creds: OpenAiCompatibleLlmCredentials,
  ) {
    this.client = new OpenAI({
      apiKey: creds.apiKey,
      baseURL: creds.baseURL,
    });
    this.agentModel = creds.intentModel;
  }

  async dispatchResumeAgent(input: ResumeAgentDispatchInput) {
    const start = Date.now();
    const historyMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      (input.chatHistory ?? []).map((turn) => ({
        role: turn.role,
        content: turn.content,
      }));

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: buildResumeAgentSystemPrompt(input.resumeAgentContext),
      },
      ...historyMessages,
      { role: 'user', content: input.userMessage },
    ];

    const response = await this.client.chat.completions.create(
      {
        model: this.agentModel,
        messages,
        tools: RESUME_AGENT_TOOLS,
        tool_choice: 'auto',
      },
      { signal: input.signal },
    );

    const turn = parseResumeAgentTurn(response.choices[0]?.message);

    this.logger.log({
      msg: 'resume_agent_dispatch_success',
      requestId: input.requestId,
      sessionId: input.sessionId,
      historyMessageCount: input.chatHistory?.length ?? 0,
      mutationToolCount: turn.mutationCalls.length,
      uiActionCount: turn.uiActions.length,
      responseTextPreview: turn.responseText.slice(0, 80),
      latencyMs: Date.now() - start,
    });

    return turn;
  }
}
