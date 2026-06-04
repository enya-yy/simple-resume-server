import {
  DEFAULT_RESUME_LAYOUT_OPTIONS,
  EMPTY_RESUME_DOCUMENT,
  listResumesResponseSchema,
} from '../../contracts/index';
import { extractResumeListPreview } from './resume-list-preview';

describe('extractResumeListPreview', () => {
  it('returns truncated preview fields from a valid document', () => {
    const preview = extractResumeListPreview({
      ...EMPTY_RESUME_DOCUMENT,
      basics: {
        ...EMPTY_RESUME_DOCUMENT.basics,
        fullName: '李四',
        headline: '前端工程师',
      },
      sections: [
        {
          id: 's1',
          type: 'experience',
          title: '工作经历',
          order: 0,
          items: [
            {
              id: 'i1',
              title: '某公司',
              bullets: ['负责核心产品', '带领 5 人团队'],
            },
            {
              id: 'i2',
              title: '另一公司',
              bullets: ['不应出现在预览'],
            },
          ],
        },
        {
          id: 's2',
          type: 'education',
          title: '教育背景',
          order: 1,
          items: [],
        },
      ],
    });

    expect(preview.previewBasics.fullName).toBe('李四');
    expect(preview.previewBasics.headline).toBe('前端工程师');
    expect(preview.sectionCount).toBe(2);
    expect(preview.previewSections).toHaveLength(2);
    expect(preview.previewSections[0]?.items).toHaveLength(1);
    expect(preview.previewSections[0]?.items[0]?.bullets).toHaveLength(2);
  });

  it('falls back to defaults for invalid document json', () => {
    const preview = extractResumeListPreview(null);
    expect(preview.templateId).toBe('classic-list');
    expect(preview.sectionCount).toBe(0);
    expect(preview.previewSections).toEqual([]);
  });

  it('list response accepts empty preview basics', () => {
    const preview = extractResumeListPreview(EMPTY_RESUME_DOCUMENT);
    expect(() =>
      listResumesResponseSchema.parse({
        resumes: [
          {
            resumeId: '00000000-0000-4000-8000-000000000099',
            title: '未命名简历',
            updatedAt: '2026-04-11T12:30:00.000Z',
            ...preview,
            layoutOptions: DEFAULT_RESUME_LAYOUT_OPTIONS,
          },
        ],
      }),
    ).not.toThrow();
  });
});
