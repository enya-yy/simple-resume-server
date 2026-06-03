import type { ResumeDocument, ResumeModuleType } from '../types/resume';

const MODULE_TYPE_LABEL: Record<ResumeModuleType, string> = {
  experience: '工作经验',
  education: '教育经历',
  project: '项目经验',
  skill: '技能（技术栈）',
  custom: '自定义模块',
};

/**
 * Build a compact Markdown summary of the current resume state.
 * Designed to be injected into intent-dispatch system prompts so the LLM
 * can make context-aware routing decisions without receiving the full JSON.
 */
export function buildResumeSummary(doc: ResumeDocument): string {
  const lines: string[] = [];

  const b = doc.basics;
  const filledBasics = (
    ['fullName', 'email', 'phone', 'location', 'headline', 'summary'] as const
  ).filter((k) => b[k]?.trim());

  if (filledBasics.length === 0) {
    lines.push('- 基本信息 (basics): 未填写');
  } else {
    const keyLabels = filledBasics
      .map((k) => {
        if (k === 'fullName') return `姓名="${b.fullName}"`;
        if (k === 'headline') return `期望职位="${b.headline}"`;
        return k;
      })
      .join('、');
    const missing = 6 - filledBasics.length;
    const suffix = missing > 0 ? `，还有 ${missing} 个字段未填` : '';
    lines.push(`- 基本信息 (basics): 已填 (${keyLabels}${suffix})`);
  }

  const typeCounts: Partial<
    Record<ResumeModuleType, { count: number; latest: string }>
  > = {};
  for (const section of doc.sections) {
    const t = section.type;
    if (!typeCounts[t]) {
      typeCounts[t] = { count: 0, latest: '' };
    }
    typeCounts[t]!.count += section.items.length;
    if (section.items.length > 0 && !typeCounts[t]!.latest) {
      typeCounts[t]!.latest = section.items[0]!.title;
    }
  }

  const orderedTypes: ResumeModuleType[] = [
    'experience',
    'education',
    'project',
    'skill',
    'custom',
  ];

  for (const t of orderedTypes) {
    const label = MODULE_TYPE_LABEL[t];
    const info = typeCounts[t];
    if (!info || info.count === 0) {
      lines.push(`- ${label} (${t}): 缺失 (0条)`);
    } else {
      const latest = info.latest ? `，最近: ${info.latest}` : '';
      lines.push(`- ${label} (${t}): 已有 ${info.count} 条${latest}`);
    }
  }

  return lines.join('\n');
}
