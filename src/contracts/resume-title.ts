import type { ResumeDocumentBasics } from './types/resume';

export const RESUME_TITLE_MAX = 80;

export const DEFAULT_RESUME_TITLES = new Set(['', '未命名简历', '新对话']);

export function isDefaultResumeTitle(title: string): boolean {
  return DEFAULT_RESUME_TITLES.has(title.trim());
}

function truncateTitle(text: string, max = RESUME_TITLE_MAX): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > max ? t.slice(0, max) : t;
}

/** 从 basics 推导库内展示名；无足够信息时返回 null */
export function deriveResumeTitleFromBasics(
  basics: Pick<
    ResumeDocumentBasics,
    'fullName' | 'headline'
  >,
): string | null {
  const name = basics.fullName?.trim() ?? '';
  const headline = basics.headline?.trim() ?? '';
  if (name && headline) {
    return truncateTitle(`${name} · ${headline}`);
  }
  if (headline) {
    return truncateTitle(`${headline}简历`);
  }
  if (name) {
    return truncateTitle(`${name}的简历`);
  }
  return null;
}

/** 将首条用户消息整理为展示名（自动命名，不锁定） */
export function deriveResumeTitleFromMessage(text: string): string {
  const t = truncateTitle(text);
  return t || '新对话';
}
