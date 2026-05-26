import { EMPTY_RESUME_DOCUMENT } from '../../schemas/resume.schema';
import type { ResumeDocument } from '../../types/resume';
import { buildImportSuccessChatMessages } from '../import-success-messages';

describe('buildImportSuccessChatMessages', () => {
  it('returns welcome, summary, and next-steps text messages', () => {
    const doc = {
      ...EMPTY_RESUME_DOCUMENT,
      basics: {
        ...EMPTY_RESUME_DOCUMENT.basics,
        fullName: '张三',
        email: 'zhang@example.com',
        phone: '13800138000',
        headline: '后端工程师',
      },
      sections: [
        {
          id: 's1',
          type: 'experience' as const,
          title: '工作经历',
          order: 0,
          items: [
            {
              id: 'e1',
              title: '某科技公司 · 后端工程师',
              bullets: ['负责 API 开发'],
            },
          ],
        },
      ],
    } as unknown as ResumeDocument;

    const messages = buildImportSuccessChatMessages(doc);

    expect(messages.length).toBeGreaterThanOrEqual(3);
    expect(messages[0].contentType).toBe('text');
    expect(messages[0].contentJson).toMatchObject({
      type: 'text',
      role: 'assistant',
    });
    expect(String(messages[0].contentJson.text)).toContain('导入');

    const summaryText = String(messages[1].contentJson.text);
    expect(summaryText).toContain('张三');
    expect(summaryText).toContain('1 条');

    const nextStepsText = String(messages[2].contentJson.text);
    expect(nextStepsText).toContain('完成度');
    expect(nextStepsText).toContain('下一步可以试试');
  });

  it('appends basic_info form card when critical basics are missing', () => {
    const doc = {
      ...EMPTY_RESUME_DOCUMENT,
      basics: {
        ...EMPTY_RESUME_DOCUMENT.basics,
        fullName: '李四',
      },
    } as ResumeDocument;

    const messages = buildImportSuccessChatMessages(doc);
    const form = messages.find((m) => m.contentType === 'form_card');

    expect(form).toBeDefined();
    expect(form?.contentJson).toMatchObject({
      type: 'form_card',
      role: 'assistant',
      formType: 'basic_info',
    });
    const fields = form?.contentJson.fields as { name: string; value?: string }[];
    expect(fields.find((f) => f.name === 'fullName')?.value).toBe('李四');
  });
});
