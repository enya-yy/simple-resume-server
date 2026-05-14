export const DASHSCOPE_DEFAULT_MODEL = 'qwen-turbo';
export const DASHSCOPE_DEFAULT_BASE_URL =
  'https://dashscope.aliyuncs.com/compatible-mode/v1';

export interface DashScopeEnvConfig {
  apiKey?: string;
  model: string;
  baseUrl: string;
}

function normalizeEnvValue(
  value: string | undefined | null,
): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function resolveDashScopeEnv(
  env: Record<string, string | undefined>,
  options?: {
    modelKey?: string;
    fallbackModel?: string;
  },
): DashScopeEnvConfig {
  const modelKey = options?.modelKey ?? 'DASHSCOPE_MODEL';
  const fallbackModel = options?.fallbackModel ?? DASHSCOPE_DEFAULT_MODEL;

  const apiKey = normalizeEnvValue(env.DASHSCOPE_API_KEY);
  const model = normalizeEnvValue(env[modelKey]) ?? fallbackModel;
  const baseUrl =
    normalizeEnvValue(env.DASHSCOPE_BASE_URL) ?? DASHSCOPE_DEFAULT_BASE_URL;

  return {
    apiKey,
    model,
    baseUrl,
  };
}
