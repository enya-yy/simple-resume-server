import type { ResumeDocument, ResumeModuleType } from '../types/resume';

function truncateForCatalog(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

const MODULE_TYPE_LABEL: Record<ResumeModuleType, string> = {
  experience: '工作经历',
  education: '教育经历',
  project: '项目经验',
  skill: '技能',
  custom: '自定义模块',
};

/**
 * Dehydrated resume view for the resume agent: basics + item ids/titles only.
 * Bullets are omitted unless explicitly requested in a future turn.
 */
export function buildResumeCatalog(doc: ResumeDocument): string {
  const lines: string[] = [];

  lines.push('## 基本信息 (basics)');
  const b = doc.basics;
  for (const key of [
    'fullName',
    'email',
    'phone',
    'location',
    'headline',
    'summary',
  ] as const) {
    const v = b[key]?.trim();
    lines.push(`- ${key}: ${v ? `"${v.length > 40 ? `${v.slice(0, 40)}…` : v}"` : '(空)'}`);
  }

  lines.push('');
  lines.push('## 模块与条目 (sections)');
  if (doc.sections.length === 0) {
    lines.push('(暂无模块)');
    return lines.join('\n');
  }

  for (const section of doc.sections) {
    const label = MODULE_TYPE_LABEL[section.type] ?? section.type;
    lines.push(
      `- 模块 id=${section.id} type=${section.type} (${label}) title="${section.title}"`,
    );
    if (section.items.length === 0) {
      lines.push('  - (无条目)');
      continue;
    }
    for (const item of section.items) {
      const nonEmptyBullets = item.bullets
        .map((b, i) => ({ b: b.trim(), i }))
        .filter((x) => x.b);
      lines.push(
        `  - 条目 id=${item.id} title="${item.title || '(无标题)'}" (${label}，指代如「${truncateForCatalog(item.title || section.title, 24)}」)`,
      );
      if (nonEmptyBullets.length === 0) {
        lines.push('    - (无 bullet 内容)');
        continue;
      }
      for (const { b, i } of nonEmptyBullets.slice(0, 8)) {
        lines.push(
          `    - bullet[${i}]: "${truncateForCatalog(b, 72)}"`,
        );
      }
      if (nonEmptyBullets.length > 8) {
        lines.push(`    - … 另有 ${nonEmptyBullets.length - 8} 条`);
      }
    }
  }

  return lines.join('\n');
}
