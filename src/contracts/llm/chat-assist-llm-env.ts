import { resolveDashScopeEnv } from './dashscope-config';
import { resolveDeepSeekEnv } from './deepseek-config';

export type ChatAssistLlmBackend = 'dashscope' | 'deepseek';

export interface ChatAssistLlmResolved {
  backend: ChatAssistLlmBackend;
  apiKey: string;
  model: string;
  baseUrl: string;
}

function normalizeProvider(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Worker 侧对话辅助任务：根据 `LLM_PROVIDER`（或 `WORKER_LLM_PROVIDER`）选择后端；
 * 未设置时若有 `DEEPSEEK_API_KEY` 优先 DeepSeek，否则回退 `DASHSCOPE_API_KEY`（兼容旧部署）。
 */
export function resolveChatAssistLlmEnv(
  env: Record<string, string | undefined>,
): ChatAssistLlmResolved | null {
  const explicit = normalizeProvider(env.LLM_PROVIDER || env.WORKER_LLM_PROVIDER);

  if (explicit === 'stub') {
    return null;
  }

  if (explicit === 'deepseek') {
    const r = resolveDeepSeekEnv(env);
    if (!r.apiKey) return null;
    return {
      backend: 'deepseek',
      apiKey: r.apiKey,
      model: r.model,
      baseUrl: r.baseUrl,
    };
  }

  if (explicit === 'dashscope') {
    const r = resolveDashScopeEnv(env);
    if (!r.apiKey) return null;
    return {
      backend: 'dashscope',
      apiKey: r.apiKey,
      model: r.model,
      baseUrl: r.baseUrl,
    };
  }

  const deepseek = resolveDeepSeekEnv(env);
  if (deepseek.apiKey) {
    return {
      backend: 'deepseek',
      apiKey: deepseek.apiKey,
      model: deepseek.model,
      baseUrl: deepseek.baseUrl,
    };
  }

  const dash = resolveDashScopeEnv(env);
  if (dash.apiKey) {
    return {
      backend: 'dashscope',
      apiKey: dash.apiKey,
      model: dash.model,
      baseUrl: dash.baseUrl,
    };
  }

  return null;
}
