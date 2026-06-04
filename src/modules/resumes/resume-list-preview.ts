import {
  DEFAULT_RESUME_LAYOUT_OPTIONS,
  DEFAULT_RESUME_TEMPLATE_ID,
  resumeDocumentSchema,
  resumeListPreviewBasicsSchema,
  type ResumeLayoutOptions,
  type ResumeModule,
  type ResumeTemplateId,
} from '../../contracts/index';
import type { z } from 'zod';

type ResumeListPreviewBasics = z.infer<typeof resumeListPreviewBasicsSchema>;

const EMPTY_PREVIEW_BASICS: ResumeListPreviewBasics = {
  fullName: '',
  email: '',
  phone: '',
  location: '',
  headline: '',
  summary: '',
};

export type ResumeListPreviewFields = {
  templateId: ResumeTemplateId;
  layoutOptions: ResumeLayoutOptions;
  previewBasics: ResumeListPreviewBasics;
  previewSections: ResumeModule[];
  sectionCount: number;
};

function truncateModuleForListPreview(module: ResumeModule): ResumeModule {
  return {
    ...module,
    items: module.items.slice(0, 1).map((item) => ({
      ...item,
      bullets: item.bullets.slice(0, 2).map((text) => text.slice(0, 120)),
    })),
  };
}

export function extractResumeListPreview(
  documentJson: unknown,
): ResumeListPreviewFields {
  const parsed = resumeDocumentSchema.safeParse(documentJson);
  if (!parsed.success) {
    return {
      templateId: DEFAULT_RESUME_TEMPLATE_ID,
      layoutOptions: { ...DEFAULT_RESUME_LAYOUT_OPTIONS },
      previewBasics: { ...EMPTY_PREVIEW_BASICS },
      previewSections: [],
      sectionCount: 0,
    };
  }

  const doc = parsed.data;
  const layoutOptions: ResumeLayoutOptions = {
    ...DEFAULT_RESUME_LAYOUT_OPTIONS,
    ...doc.layoutOptions,
  };
  return {
    templateId: doc.templateId,
    layoutOptions,
    previewBasics: {
      fullName: doc.basics.fullName ?? '',
      email: doc.basics.email ?? '',
      phone: doc.basics.phone ?? '',
      location: doc.basics.location ?? '',
      headline: doc.basics.headline ?? '',
      summary: (doc.basics.summary ?? '').slice(0, 300),
    },
    previewSections: doc.sections.slice(0, 2).map(truncateModuleForListPreview),
    sectionCount: doc.sections.length,
  };
}
