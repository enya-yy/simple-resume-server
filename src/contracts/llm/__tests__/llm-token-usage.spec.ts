import { normalizeLlmUsage } from '../llm-token-usage';

describe('normalizeLlmUsage', () => {
  it('maps OpenAI usage fields', () => {
    expect(
      normalizeLlmUsage({
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      }),
    ).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
  });

  it('derives total from prompt + completion when total missing', () => {
    expect(
      normalizeLlmUsage({ prompt_tokens: 10, completion_tokens: 5 }),
    ).toMatchObject({ totalTokens: 15 });
  });

  it('returns zeros for missing usage', () => {
    expect(normalizeLlmUsage(null)).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
  });
});
