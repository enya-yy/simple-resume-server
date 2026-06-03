import { createChatAssistJobBodySchema } from '../chat-assist.schema';

describe('createChatAssistJobBodySchema', () => {
  const resumeId = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts polish jobs with source text', () => {
    const parsed = createChatAssistJobBodySchema.parse({
      resumeId,
      assistKind: 'polish',
      targetHint: 'summary',
      sourceText: '负责产品规划与迭代。',
    });
    expect(parsed.assistKind).toBe('polish');
    if (parsed.assistKind === 'polish') {
      expect(parsed.sourceText).toContain('产品规划');
    }
  });

  it('rejects polish jobs with empty source text', () => {
    expect(() =>
      createChatAssistJobBodySchema.parse({
        resumeId,
        assistKind: 'polish',
        targetHint: 'description',
        sourceText: '   ',
      }),
    ).toThrow();
  });

  it('still accepts basics suggestion jobs', () => {
    const parsed = createChatAssistJobBodySchema.parse({
      resumeId,
      assistKind: 'basics',
      targetHint: 'fullName',
    });
    expect(parsed.assistKind).toBe('basics');
  });
});
