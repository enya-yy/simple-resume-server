import { EMPTY_RESUME_DOCUMENT } from '../../schemas/resume.schema';
import type { ResumeDocument } from '../../types/resume';
import { buildResumeCatalog } from '../resume-catalog';

describe('buildResumeCatalog', () => {
  it('includes item ids for agent targeting', () => {
    const doc: ResumeDocument = {
      ...(EMPTY_RESUME_DOCUMENT as ResumeDocument),
      basics: { ...EMPTY_RESUME_DOCUMENT.basics, fullName: '李四' },
      sections: [
        {
          id: 'mod-1',
          type: 'experience' as const,
          title: '工作经历',
          order: 0,
          items: [
            {
              id: 'item-abc',
              title: '某公司 · 开发',
              bullets: ['做了 A', '做了 B'],
            },
          ],
        },
      ],
    };
    const catalog = buildResumeCatalog(doc);
    expect(catalog).toContain('fullName');
    expect(catalog).toContain('李四');
    expect(catalog).toContain('id=item-abc');
    expect(catalog).toContain('bullet[0]');
    expect(catalog).toContain('做了 A');
  });
});
