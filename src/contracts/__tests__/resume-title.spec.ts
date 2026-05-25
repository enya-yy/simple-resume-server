import {
  deriveResumeTitleFromBasics,
  deriveResumeTitleFromMessage,
  isDefaultResumeTitle,
} from '../resume-title';

describe('resume-title', () => {
  it('isDefaultResumeTitle recognizes placeholders', () => {
    expect(isDefaultResumeTitle('未命名简历')).toBe(true);
    expect(isDefaultResumeTitle('新对话')).toBe(true);
    expect(isDefaultResumeTitle('产品经理简历')).toBe(false);
  });

  it('deriveResumeTitleFromBasics prefers name + headline', () => {
    expect(
      deriveResumeTitleFromBasics({
        fullName: '张三',
        headline: '前端工程师',
      }),
    ).toBe('张三 · 前端工程师');
  });

  it('deriveResumeTitleFromBasics falls back to headline or name', () => {
    expect(
      deriveResumeTitleFromBasics({ fullName: '', headline: '产品经理' }),
    ).toBe('产品经理简历');
    expect(
      deriveResumeTitleFromBasics({ fullName: '李四', headline: '' }),
    ).toBe('李四的简历');
  });

  it('deriveResumeTitleFromMessage truncates whitespace', () => {
    expect(deriveResumeTitleFromMessage('  帮我写  前端简历  ')).toBe(
      '帮我写 前端简历',
    );
  });
});
