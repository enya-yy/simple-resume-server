import { z } from 'zod';

import type {
  LayoutOptionDimension,
  ResumeBasicsSensitiveMap,
  ResumeBodyLineHeight,
  ResumeFontSizeStep,
  ResumeLayoutOptions,
  ResumePageMargin,
  ResumeTemplateId,
} from '../types/resume';

export const RESUME_TEMPLATE_IDS = [
  'classic-list',
  'minimal-dual',
] as const satisfies readonly ResumeTemplateId[];

/** 双栏/侧栏模板（固定页边距） */
export const SIDEBAR_TEMPLATE_IDS = ['minimal-dual'] as const satisfies readonly ResumeTemplateId[];

export function isSidebarTemplateId(templateId: ResumeTemplateId): boolean {
  return (SIDEBAR_TEMPLATE_IDS as readonly string[]).includes(templateId);
}

/** 模版库与编辑器内选择器共用文案，避免漂移 */
export const RESUME_TEMPLATE_LABELS: Record<ResumeTemplateId, string> = {
  'classic-list': '经典单列',
  'minimal-dual': '极简双栏',
};

export const DEFAULT_RESUME_TEMPLATE_ID: ResumeTemplateId = 'classic-list';

/** 读库时将已删除的旧 templateId 映射到新模板 */
const LEGACY_TEMPLATE_ID_MAP: Record<string, ResumeTemplateId> = {
  'amber-elegant': 'classic-list',
  'obsidian-gold': 'minimal-dual',
  'professional-two-column': 'classic-list',
  'header-icon': 'classic-list',
  'creative-gradient': 'classic-list',
  'sidebar-forest': 'minimal-dual',
  'executive-navy': 'minimal-dual',
  'demo-amber-elegant': 'classic-list',
  'demo-obsidian-gold': 'minimal-dual',
  'emerald-luxe': 'classic-list',
  'demo-emerald-luxe': 'classic-list',
};

export const resumeTemplateIdSchema = z.enum(RESUME_TEMPLATE_IDS);

function normalizeTemplateIdInput(raw: unknown): ResumeTemplateId {
  if (typeof raw === 'string' && raw in LEGACY_TEMPLATE_ID_MAP) {
    return LEGACY_TEMPLATE_ID_MAP[raw]!;
  }
  const parsed = resumeTemplateIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_RESUME_TEMPLATE_ID;
}

/** 宽松：缺省/非法值归一为默认模板（读库、兼容旧数据） */
export const resumeTemplateIdLooseSchema = z.preprocess(
  (val) => normalizeTemplateIdInput(val),
  resumeTemplateIdSchema,
);

export const DEFAULT_RESUME_LAYOUT_OPTIONS: ResumeLayoutOptions = {
  fontSizeStep: 1,
  pageMargin: 'standard',
  bodyLineHeight: 'normal',
};

export const resumeFontSizeStepSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
]);

export const resumePageMarginSchema = z.enum(['compact', 'standard']);

export const resumeBodyLineHeightSchema = z.enum([
  'tight',
  'normal',
  'relaxed',
]);

export const resumeLayoutOptionsStrictSchema = z.object({
  fontSizeStep: resumeFontSizeStepSchema,
  pageMargin: resumePageMarginSchema,
  bodyLineHeight: resumeBodyLineHeightSchema,
});

function normalizeLayoutOptionsInput(raw: unknown): ResumeLayoutOptions {
  const d = DEFAULT_RESUME_LAYOUT_OPTIONS;
  if (!raw || typeof raw !== 'object') {
    return { ...d };
  }
  const o = raw as Record<string, unknown>;
  let fontSizeStep: ResumeFontSizeStep = d.fontSizeStep;
  const fs = o.fontSizeStep;
  if (fs === 0 || fs === 1 || fs === 2) {
    fontSizeStep = fs;
  } else if (
    typeof fs === 'number' &&
    Number.isInteger(fs) &&
    fs >= 0 &&
    fs <= 2
  ) {
    fontSizeStep = fs as ResumeFontSizeStep;
  } else if (typeof fs === 'string') {
    const n = Number.parseInt(fs, 10);
    if (n === 0 || n === 1 || n === 2) {
      fontSizeStep = n as ResumeFontSizeStep;
    }
  }
  const pm = o.pageMargin;
  const pageMargin: ResumePageMargin =
    pm === 'compact' || pm === 'standard' ? pm : d.pageMargin;
  const lh = o.bodyLineHeight;
  const bodyLineHeight: ResumeBodyLineHeight =
    lh === 'tight' || lh === 'normal' || lh === 'relaxed'
      ? lh
      : d.bodyLineHeight;
  return { fontSizeStep, pageMargin, bodyLineHeight };
}

/** 宽松：缺省/非法字段回退为默认（旧 JSON、部分 PATCH） */
export const resumeLayoutOptionsLooseSchema = z.preprocess(
  (val) => normalizeLayoutOptionsInput(val),
  resumeLayoutOptionsStrictSchema,
);

/** 某模板是否允许调整该版式维度（用于控件 disabled + 文案） */
export function templateSupportsLayoutDimension(
  templateId: ResumeTemplateId,
  dimension: LayoutOptionDimension,
): boolean {
  if (isSidebarTemplateId(templateId) && dimension === 'pageMargin') {
    return false;
  }
  return true;
}

export function layoutDimensionDisabledHint(
  templateId: ResumeTemplateId,
  dimension: LayoutOptionDimension,
): string | undefined {
  if (isSidebarTemplateId(templateId) && dimension === 'pageMargin') {
    return '双栏模板为固定版心，暂不支持切换页边距';
  }
  return undefined;
}

export const resumeIdSchema = z.string().uuid();

export const resumeBasicsFieldKeys = [
  'fullName',
  'email',
  'phone',
  'location',
  'headline',
  'summary',
] as const;

export type ResumeBasicsFieldKey = (typeof resumeBasicsFieldKeys)[number];

export const DEFAULT_RESUME_BASICS: Record<ResumeBasicsFieldKey, string> = {
  fullName: '',
  email: '',
  phone: '',
  location: '',
  headline: '',
  summary: '',
};

function mergeBasicsInput(raw: unknown): Record<ResumeBasicsFieldKey, string> {
  const patch =
    raw && typeof raw === 'object'
      ? (raw as Partial<Record<ResumeBasicsFieldKey, unknown>>)
      : {};
  const next = { ...DEFAULT_RESUME_BASICS };
  for (const key of resumeBasicsFieldKeys) {
    const v = patch[key];
    if (typeof v === 'string') {
      next[key] = v;
    }
  }
  return next;
}

/**与 JSON Schema `ResumeBasicsSensitiveMap`一致：`additionalProperties: false` */
export const basicsSensitiveSchema = z
  .object({
    fullName: z.boolean().optional(),
    email: z.boolean().optional(),
    phone: z.boolean().optional(),
    location: z.boolean().optional(),
    headline: z.boolean().optional(),
    summary: z.boolean().optional(),
  })
  .strict()
  .optional();

export const DEFAULT_BASICS_SENSITIVE: ResumeBasicsSensitiveMap = {};

function mergeBasicsSensitiveInput(
  raw: unknown,
): ResumeBasicsSensitiveMap | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  const result: Record<string, boolean> = {};
  for (const key of resumeBasicsFieldKeys) {
    if (typeof o[key] === 'boolean') {
      result[key] = o[key] as boolean;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

const basicsLooseSchema = z.object({
  fullName: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  headline: z.string(),
  summary: z.string(),
});

/** 宽松解析：合并默认值，保证 `basics` 始终完整，避免前端/DB 缺字段 */
export const resumeBasicsLooseSchema = z.preprocess(
  (val) => mergeBasicsInput(val),
  basicsLooseSchema,
);

const phonePattern = /^[+()\d\s\-]{1,40}$/;

export const resumeBasicsStrictSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, { message: '请输入姓名' })
    .max(80, { message: '姓名最多 80 个字符' }),
  email: z
    .string()
    .trim()
    .min(1, { message: '请输入邮箱' })
    .max(254, { message: '邮箱过长' })
    .pipe(z.email({ message: '邮箱格式不正确' })),
  phone: z
    .string()
    .trim()
    .min(1, { message: '请输入手机号' })
    .max(40, { message: '手机号最多 40 个字符' })
    .refine((s) => phonePattern.test(s), {
      message: '手机号格式不正确',
    }),
  location: z.string().trim().max(120, { message: '工作城市最多 120 个字符' }),
  headline: z.string().trim().max(120, { message: '期望职位最多 120 个字符' }),
  summary: z.string().trim().max(2000, { message: '摘要最多 2000 个字符' }),
});

export const resumeModuleTypeSchema = z.enum([
  'experience',
  'education',
  'project',
  'skill',
  'custom',
]);

/** 单条条目下要点数量上限（与下方 `resumeModuleSchema` 中 bullets 数组一致） */
export const MAX_BULLETS_PER_ITEM = 50;

/** 简历模块（sections）数量上限，与 JSON Schema `sections.maxItems` 一致 */
export const MAX_RESUME_SECTIONS = 200;

/** 单个模块内条目数上限，与 JSON Schema `ResumeModule.items.maxItems` 一致 */
export const MAX_ITEMS_PER_MODULE = 200;

export const resumeModuleSchema = z.object({
  id: z.string().trim().min(1, { message: '模块 id 不能为空' }),
  type: resumeModuleTypeSchema,
  title: z
    .string()
    .trim()
    .min(1, { message: '模块标题不能为空' })
    .max(80, { message: '模块标题最多 80 个字符' }),
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1, { message: '条目 id 不能为空' }),
        title: z
          .string()
          .trim()
          .max(120, { message: '条目标题最多 120 个字符' })
          .default(''),
        bullets: z
          .array(z.string().trim().max(300, { message: '要点最多 300 个字符' }))
          .max(MAX_BULLETS_PER_ITEM, {
            message: '要点过多',
          })
          .default([]),
        titleSensitive: z.boolean().optional(),
        bulletSensitive: z
          .array(z.boolean())
          .max(MAX_BULLETS_PER_ITEM)
          .optional(),
      }),
    )
    .max(MAX_ITEMS_PER_MODULE, { message: '模块条目过多' })
    .default([]),
  order: z.number().int().nonnegative(),
});

function normalizeModulesInput(raw: unknown) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((m): m is Record<string, unknown> =>
      Boolean(m && typeof m === 'object'),
    )
    .map((m, index) => {
      const type =
        typeof m.type === 'string' &&
        (
          ['experience', 'education', 'project', 'skill', 'custom'] as const
        ).includes(
          m.type as 'experience' | 'education' | 'project' | 'skill' | 'custom',
        )
          ? (m.type as
              | 'experience'
              | 'education'
              | 'project'
              | 'skill'
              | 'custom')
          : 'custom';
      const idRaw = typeof m.id === 'string' ? m.id.trim() : '';
      const titleRaw = typeof m.title === 'string' ? m.title.trim() : '';
      return {
        id: idRaw || `module-${index + 1}`,
        type,
        title: titleRaw || '未命名模块',
        items: Array.isArray(m.items)
          ? m.items
              .map((item, itemIndex) => {
                if (typeof item === 'string') {
                  return {
                    id: `item-${index + 1}-${itemIndex + 1}`,
                    title: item,
                    bullets: [],
                  };
                }
                if (!item || typeof item !== 'object') {
                  return null;
                }
                const itemRecord = item as Record<string, unknown>;
                const itemIdRaw =
                  typeof itemRecord.id === 'string' ? itemRecord.id.trim() : '';
                const itemTitleRaw =
                  typeof itemRecord.title === 'string'
                    ? itemRecord.title.trim()
                    : '';
                const sourceBullets = Array.isArray(itemRecord.bullets)
                  ? itemRecord.bullets
                  : [];
                const bullets: string[] = [];
                const bulletSourceIndexes: number[] = [];
                for (
                  let sourceIndex = 0;
                  sourceIndex < sourceBullets.length;
                  sourceIndex += 1
                ) {
                  const bullet = sourceBullets[sourceIndex];
                  if (typeof bullet === 'string') {
                    bullets.push(bullet);
                    bulletSourceIndexes.push(sourceIndex);
                  }
                }
                const titleSensitive =
                  typeof itemRecord.titleSensitive === 'boolean'
                    ? itemRecord.titleSensitive
                    : undefined;
                const rawBulletSensitive = Array.isArray(
                  itemRecord.bulletSensitive,
                )
                  ? itemRecord.bulletSensitive
                  : undefined;
                const bulletSensitive = rawBulletSensitive
                  ? bulletSourceIndexes.map(
                      (sourceIndex) => rawBulletSensitive[sourceIndex] === true,
                    )
                  : undefined;
                const hasBulletSensitive = Boolean(
                  bulletSensitive &&
                    bulletSensitive.some((flag) => flag === true),
                );
                return {
                  id: itemIdRaw || `item-${index + 1}-${itemIndex + 1}`,
                  title: itemTitleRaw,
                  bullets,
                  ...(titleSensitive !== undefined ? { titleSensitive } : {}),
                  ...(hasBulletSensitive ? { bulletSensitive } : {}),
                };
              })
              .filter(
                (
                  item,
                ): item is {
                  id: string;
                  title: string;
                  bullets: string[];
                  titleSensitive?: boolean;
                  bulletSensitive?: boolean[];
                } => Boolean(item),
              )
          : [],
        order: index,
      };
    })
    .slice(0, MAX_RESUME_SECTIONS);
}

export const resumeModulesLooseSchema = z.preprocess(
  (val) => normalizeModulesInput(val),
  z.array(resumeModuleSchema).max(MAX_RESUME_SECTIONS).default([]),
);

export const resumeDocumentStrictSchema = z
  .object({
    templateId: resumeTemplateIdSchema,
    layoutOptions: resumeLayoutOptionsStrictSchema,
    basics: resumeBasicsStrictSchema,
    sections: z
      .array(resumeModuleSchema)
      .max(MAX_RESUME_SECTIONS, { message: '模块数量过多' }),
    basicsSensitive: basicsSensitiveSchema,
  })
  .strict();

const patchResumeDocumentShape = z
  .object({
    templateId: resumeTemplateIdSchema,
    /** 可省略：旧客户端或手工 PATCH 未带此项时，服务端用库内已有值归并 */
    layoutOptions: resumeLayoutOptionsStrictSchema.optional(),
    basics: resumeBasicsStrictSchema,
    sections: resumeModulesLooseSchema,
    basicsSensitive: basicsSensitiveSchema,
  })
  .strict();

export const patchResumeTitleSchema = z
  .string()
  .trim()
  .min(1, { message: '标题不能为空' })
  .max(80, { message: '标题最多 80 字' });

/** PATCH /resumes/:resumeId — 更新正文和/或库内展示名 */
export const patchResumeBodySchema = z
  .object({
    document: patchResumeDocumentShape.optional(),
    title: patchResumeTitleSchema.optional(),
    /** 显式传 title 时默认锁定，禁止后续自动覆盖；自动命名时传 false */
    lockTitle: z.boolean().optional(),
  })
  .refine((body) => body.document !== undefined || body.title !== undefined, {
    message: '至少需要 document 或 title',
  });

export type PatchResumeBody = z.infer<typeof patchResumeBodySchema>;

export const resumeDocumentSchema = z.object({
  templateId: resumeTemplateIdLooseSchema,
  layoutOptions: resumeLayoutOptionsLooseSchema,
  basics: resumeBasicsLooseSchema,
  sections: resumeModulesLooseSchema,
  basicsSensitive: z.preprocess(
    (val) => mergeBasicsSensitiveInput(val),
    basicsSensitiveSchema,
  ),
});

export const resumeSchema = z.object({
  id: resumeIdSchema,
  userId: z.string().uuid(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createResumeResponseSchema = z.object({
  resumeId: resumeIdSchema,
  /** 与新建简历在同一事务中创建的 chat_session */
  sessionId: z.string().uuid(),
  document: resumeDocumentSchema,
});

/** POST /resumes/:resumeId/duplicate — 与新建响应形状一致 */
export const duplicateResumeResponseSchema = createResumeResponseSchema;

/** 列表缩略图：允许未填写的 basics，不做编辑器提交级校验 */
export const resumeListPreviewBasicsSchema = z.object({
  fullName: z.string().trim().max(80),
  email: z.string().trim().max(254),
  phone: z.string().trim().max(40),
  location: z.string().trim().max(120),
  headline: z.string().trim().max(120),
  summary: z.string().trim().max(2000),
});

/** GET /resumes 列表项：含缩略图所需预览字段（非完整 document） */
export const resumeListItemSchema = z.object({
  resumeId: resumeIdSchema,
  title: z.string(),
  updatedAt: z.string().datetime(),
  templateId: resumeTemplateIdLooseSchema,
  layoutOptions: resumeLayoutOptionsStrictSchema,
  previewBasics: resumeListPreviewBasicsSchema,
  previewSections: z.array(resumeModuleSchema).max(2),
  sectionCount: z.number().int().nonnegative(),
});

export const listResumesResponseSchema = z.object({
  resumes: z.array(resumeListItemSchema),
});

export const loadResumeResponseSchema = z.object({
  resumeId: resumeIdSchema,
  title: z.string(),
  document: resumeDocumentSchema,
  schemaVersion: z.number().int().positive(),
});

export const patchResumeResponseSchema = loadResumeResponseSchema;

export type ResumeListItem = z.infer<typeof resumeListItemSchema>;
export type ListResumesResponse = z.infer<typeof listResumesResponseSchema>;

export type ResumeDocumentSchemaType = z.infer<typeof resumeDocumentSchema>;

/** 新建简历（POST /resumes）默认正文；经 `resumeDocumentSchema` 校验，避免手写 JSON 与读写契约漂移。 */
export const EMPTY_RESUME_DOCUMENT: ResumeDocumentSchemaType =
  resumeDocumentSchema.parse({
    templateId: DEFAULT_RESUME_TEMPLATE_ID,
    layoutOptions: { ...DEFAULT_RESUME_LAYOUT_OPTIONS },
    basics: { ...DEFAULT_RESUME_BASICS },
    sections: [],
  });

export type ResumeDTO = z.infer<typeof resumeSchema>;
export type CreateResumeResponse = z.infer<typeof createResumeResponseSchema>;
export type DuplicateResumeResponse = z.infer<
  typeof duplicateResumeResponseSchema
>;
export type LoadResumeResponse = z.infer<typeof loadResumeResponseSchema>;
export type PatchResumeResponse = z.infer<typeof patchResumeResponseSchema>;

const fieldValidatorMap: Record<ResumeBasicsFieldKey, z.ZodType<string>> = {
  fullName: resumeBasicsStrictSchema.shape.fullName,
  email: resumeBasicsStrictSchema.shape.email,
  phone: resumeBasicsStrictSchema.shape.phone,
  location: resumeBasicsStrictSchema.shape.location,
  headline: resumeBasicsStrictSchema.shape.headline,
  summary: resumeBasicsStrictSchema.shape.summary,
};

/** 单字段校验，供前端内联错误展示（与 PATCH 服务端规则一致） */
export function validateBasicsField(
  key: ResumeBasicsFieldKey,
  value: string,
): string | undefined {
  const parsed = fieldValidatorMap[key].safeParse(value);
  if (parsed.success) {
    return undefined;
  }
  const first = parsed.error.issues[0];
  return first?.message ?? '格式不正确';
}
