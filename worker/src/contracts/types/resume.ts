/** 简历预览模板 ID（与 `resumeTemplateIdSchema`、持久化 JSON 字段一致） */
export type ResumeTemplateId =
  | 'classic-list'
  | 'minimal-dual'
  | 'executive-dark'
  | 'editorial-gold';

/** 正文字体档位（可序列化，与导出 Worker 对齐） */
export type ResumeFontSizeStep = 0 | 1 | 2;

/** 预览/导出页边距语义（屏幕预览用容器 padding；PDF 导出可复用） */
export type ResumePageMargin = 'compact' | 'standard';

/** 正文行距 */
export type ResumeBodyLineHeight = 'tight' | 'normal' | 'relaxed';

export type ResumeLayoutOptions = {
  fontSizeStep: ResumeFontSizeStep;
  pageMargin: ResumePageMargin;
  bodyLineHeight: ResumeBodyLineHeight;
};

/** 与 `templateSupportsLayoutDimension` 对齐的维度键 */
export type LayoutOptionDimension = keyof ResumeLayoutOptions;

/** 基础信息字段级敏感标记（key 与 ResumeDocumentBasics 同名字段一一对应） */
export type ResumeBasicsSensitiveMap = {
  fullName?: boolean;
  email?: boolean;
  phone?: boolean;
  location?: boolean;
  headline?: boolean;
  summary?: boolean;
};

export type ResumeDocumentBasics = {
  fullName: string;
  email: string;
  /** 手机号（必填，需符合基本格式） */
  phone: string;
  /** 工作城市（展示用文案，可与行政区划名称一致） */
  location: string;
  /** 期望职位 / headline */
  headline: string;
  summary: string;
};

export type ResumeModuleType =
  | 'experience'
  | 'education'
  | 'project'
  | 'skill'
  | 'custom';

export type ResumeSectionItem = {
  id: string;
  title: string;
  bullets: string[];
  /** 条目标题是否敏感 */
  titleSensitive?: boolean;
  /** 各要点是否敏感（按 bullets 索引对齐） */
  bulletSensitive?: boolean[];
};

export type ResumeModule = {
  id: string;
  type: ResumeModuleType;
  title: string;
  items: ResumeSectionItem[];
  order: number;
};

export type ResumeDocument = {
  /** 预览模板；与 Epic 2 后续 layout 选项并存于 document 顶层 */
  templateId: ResumeTemplateId;
  /** 版式参数（仅呈现，不改变结构化内容） */
  layoutOptions: ResumeLayoutOptions;
  basics: ResumeDocumentBasics;
  sections: ResumeModule[];
  /** 基础信息字段级敏感标记 */
  basicsSensitive?: ResumeBasicsSensitiveMap;
};
