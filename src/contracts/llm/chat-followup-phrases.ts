import type { ResumeDocument, ResumeModuleType } from '../types/resume';

const BASICS_KEYS = [
  'fullName',
  'email',
  'phone',
  'location',
  'headline',
  'summary',
] as const;

/** 已填写的基础信息字段数（0–6） */
export function basicsFilledCount(doc: ResumeDocument): number {
  return BASICS_KEYS.filter((k) => doc.basics[k]?.trim()).length;
}

function sectionItemCount(doc: ResumeDocument, t: ResumeModuleType): number {
  let n = 0;
  for (const s of doc.sections) {
    if (s.type === t) n += s.items.length;
  }
  return n;
}

export type ChatPersistedFormType =
  | 'basic_info'
  | 'experience'
  | 'education'
  | 'project'
  | 'skill';

/**
 * 根据当前简历草稿与刚保存的表单类型，生成「猜你想做」快捷短语（用作聊天建议按钮文案）。
 * 优先补全仍缺失的模块，再给出「再添加一条」与润色、预览类动作。
 */
export function buildResumeProgressFollowupPhrases(
  doc: ResumeDocument,
  options?: { lastSavedFormType?: ChatPersistedFormType },
): string[] {
  const phrases: string[] = [];
  const add = (p: string) => {
    if (!phrases.includes(p)) phrases.push(p);
  };

  const basicsN = basicsFilledCount(doc);
  const exp = sectionItemCount(doc, 'experience');
  const proj = sectionItemCount(doc, 'project');
  const edu = sectionItemCount(doc, 'education');
  const skill = sectionItemCount(doc, 'skill');
  const last = options?.lastSavedFormType;

  if (basicsN < 6) add('完善基础信息');

  if (exp === 0) add('添加工作经历');
  if (proj === 0) add('补充项目经验');
  if (edu === 0) add('填写教育背景');
  if (skill === 0) add('添加技能亮点');

  if (last === 'experience' && exp > 0) add('再添加一段工作经历');
  if (last === 'project' && proj > 0) add('再添加一条项目经验');
  if (last === 'education' && edu > 0) add('再添加一段教育经历');
  if (last === 'skill' && skill > 0) add('补充更多技能');

  if (last === 'basic_info' && !doc.basics.summary?.trim()) {
    add('帮我写一段个人简介');
  }

  add('润色简历里的某一段文字');
  add('查看简历预览');

  return phrases.slice(0, 9);
}
