import type { IntentResult } from '../../contracts/index';

export interface IntentDispatchInput {
  userMessage: string;
  sessionId: string;
  requestId: string;
  /** Compact resume status injected as context for intent routing. */
  resumeSummary?: string;
  signal?: AbortSignal;
}

export interface StreamChatInput {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  sessionId: string;
  requestId: string;
  onToken: (text: string) => void | Promise<void>;
  onDone: () => void | Promise<void>;
  signal?: AbortSignal;
}

export interface ILlmGateway {
  dispatchIntent(input: IntentDispatchInput): Promise<IntentResult>;
  streamChat(input: StreamChatInput): Promise<void>;
}

export const LLM_GATEWAY = Symbol('LLM_GATEWAY');
