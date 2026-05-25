import type { EnvConfig } from '../../config/env.schema';

export function maskSecret(value: string | undefined): string {
  if (!value) return '(not set)';
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function logLlmStartupConfig(env: EnvConfig): void {
  const isDash = env.LLM_PROVIDER === 'dashscope';
  const isDeepSeek = env.LLM_PROVIDER === 'deepseek';

  console.log(
    JSON.stringify({
      msg: 'llm_startup_config',
      provider: env.LLM_PROVIDER,
      dashscopeApiKey: maskSecret(env.DASHSCOPE_API_KEY),
      deepseekApiKey: maskSecret(env.DEEPSEEK_API_KEY),
      chatModel: isDash
        ? env.DASHSCOPE_MODEL
        : isDeepSeek
          ? env.DEEPSEEK_MODEL
          : '(n/a)',
      intentModel: isDash
        ? env.DASHSCOPE_INTENT_MODEL
        : isDeepSeek
          ? env.DEEPSEEK_INTENT_MODEL
          : '(n/a)',
      baseUrl: isDash
        ? env.DASHSCOPE_BASE_URL
        : isDeepSeek
          ? env.DEEPSEEK_BASE_URL
          : '(n/a)',
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
  | 'resume_agent_dispatch_start'
  | 'resume_agent_dispatch_done'
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
