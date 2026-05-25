import type { ResumeAgentTurn } from './resume-agent-response-parse';
import type { ResumeAgentChatTurn } from '../../contracts/llm/chat-history-for-agent';

export interface ResumeAgentDispatchInput {
  userMessage: string;
  sessionId: string;
  requestId: string;
  /** 脱水目录 + 完成度分析等 */
  resumeAgentContext?: string;
  /** 当前消息之前的最近若干轮对话 */
  chatHistory?: ResumeAgentChatTurn[];
  signal?: AbortSignal;
}

export interface ILlmGateway {
  dispatchResumeAgent(input: ResumeAgentDispatchInput): Promise<ResumeAgentTurn>;
}

export const LLM_GATEWAY = Symbol('LLM_GATEWAY');
