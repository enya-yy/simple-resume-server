import type { EnvConfig } from '../../config/env.schema';

export function maskSecret(value: string | undefined): string {
  if (!value) return '(not set)';
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function logLlmStartupConfig(env: EnvConfig): void {
  console.log(
    JSON.stringify({
      msg: 'llm_startup_config',
      provider: env.LLM_PROVIDER,
      dashscopeApiKey: maskSecret(env.DASHSCOPE_API_KEY),
      chatModel: env.DASHSCOPE_MODEL,
      intentModel: env.DASHSCOPE_INTENT_MODEL,
      baseUrl: env.DASHSCOPE_BASE_URL,
      llmDebug: env.LLM_DEBUG,
      firstByteTimeoutMs: env.LLM_FIRST_BYTE_TIMEOUT_MS,
      streamIdleTimeoutMs: env.LLM_STREAM_IDLE_TIMEOUT_MS,
      streamMaxDurationMs: env.LLM_STREAM_MAX_DURATION_MS,
      confidenceThreshold: env.LLM_CONFIDENCE_THRESHOLD,
    }),
  );
}

export type LlmDebugStep =
  | 'chat_pipeline_start'
  | 'intent_dispatch_start'
  | 'intent_dispatch_done'
  | 'intent_dispatch_catastrophic'
  | 'stream_chat_start'
  | 'stream_chat_first_token'
  | 'stream_chat_done'
  | 'stream_chat_fallback'
  | 'response_ready';

export interface LlmDebugPayload {
  step: LlmDebugStep;
  provider: string;
  requestId: string;
  sessionId: string;
  [key: string]: unknown;
}
