export const LLM_USAGE_SOURCES = {
  CHAT_AGENT: 'chat_agent',
  IMPORT_OCR: 'import_ocr',
  IMPORT_PARSE: 'import_parse',
  CHAT_ASSIST: 'chat_assist',
} as const;

export type LlmUsageSource =
  (typeof LLM_USAGE_SOURCES)[keyof typeof LLM_USAGE_SOURCES];

export type LlmUsageSnapshot = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export function normalizeLlmUsage(raw?: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
} | null): LlmUsageSnapshot {
  const prompt = Math.max(0, Number(raw?.prompt_tokens ?? 0) || 0);
  const completion = Math.max(0, Number(raw?.completion_tokens ?? 0) || 0);
  const total = Math.max(
    0,
    Number(raw?.total_tokens ?? 0) || prompt + completion,
  );
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total,
  };
}
