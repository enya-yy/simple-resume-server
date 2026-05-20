/** DeepSeek OpenAI-compatible Chat Completions API. @see https://api-docs.deepseek.com/ */
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-v4-flash';
export const DEEPSEEK_DEFAULT_BASE_URL = 'https://api.deepseek.com';

export interface DeepSeekEnvConfig {
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

export function resolveDeepSeekEnv(
  env: Record<string, string | undefined>,
  options?: {
    modelKey?: string;
    fallbackModel?: string;
  },
): DeepSeekEnvConfig {
  const modelKey = options?.modelKey ?? 'DEEPSEEK_MODEL';
  const fallbackModel = options?.fallbackModel ?? DEEPSEEK_DEFAULT_MODEL;

  const apiKey = normalizeEnvValue(env.DEEPSEEK_API_KEY);
  const model = normalizeEnvValue(env[modelKey]) ?? fallbackModel;
  const baseUrl =
    normalizeEnvValue(env.DEEPSEEK_BASE_URL) ?? DEEPSEEK_DEFAULT_BASE_URL;

  return {
    apiKey,
    model,
    baseUrl,
  };
}
