import {
  basicsFilledCount,
  buildResumeProgressFollowupPhrases,
} from './chat-followup-phrases';
import type { ResumeDocument, ResumeModuleType } from '../types/resume';

const BASICS_LABELS: Record<string, string> = {
  fullName: '姓名',
  email: '邮箱',
  phone: '手机',
  location: '工作城市',
  headline: '期望职位',
  summary: '个人简介',
};

const MODULE_PRIORITY: ResumeModuleType[] = [
  'experience',
  'project',
  'education',
  'skill',
];

function sectionItemCount(doc: ResumeDocument, t: ResumeModuleType): number {
  let n = 0;
  for (const s of doc.sections) {
    if (s.type === t) n += s.items.length;
  }
  return n;
}

export type ResumeCompletionAnalysis = {
  /** 0–100，规则估算完整度 */
  scorePercent: number;
  missingBasics: string[];
  missingModules: ResumeModuleType[];
  hints: string[];
  suggestionPhrases: string[];
};

/**
 * 轻量规则引擎：同步计算完成度，注入 Resume Agent，无需额外 LLM 调用。
 */
export function analyzeResumeCompletion(
  doc: ResumeDocument,
): ResumeCompletionAnalysis {
  const missingBasics: string[] = [];
  for (const [key, label] of Object.entries(BASICS_LABELS)) {
    const v = doc.basics[key as keyof typeof doc.basics];
    if (!v?.trim()) missingBasics.push(label);
  }

  const missingModules: ResumeModuleType[] = [];
  for (const t of MODULE_PRIORITY) {
    if (sectionItemCount(doc, t) === 0) {
      missingModules.push(t);
    }
  }

  const basicsN = basicsFilledCount(doc);
  const basicsScore = (basicsN / 6) * 40;
  let moduleScore = 0;
  for (const t of MODULE_PRIORITY) {
    if (sectionItemCount(doc, t) > 0) moduleScore += 15;
  }
  const scorePercent = Math.min(
    100,
    Math.round(basicsScore + moduleScore),
  );

  const hints: string[] = [];
  if (missingBasics.length > 0) {
    hints.push(`基本信息仍缺：${missingBasics.join('、')}`);
  }
  if (missingModules.length > 0) {
    const labels: Record<ResumeModuleType, string> = {
      experience: '工作经历',
      education: '教育经历',
      project: '项目经验',
      skill: '技能',
      custom: '自定义模块',
    };
    hints.push(
      `内容模块仍缺：${missingModules.map((t) => labels[t]).join('、')}`,
    );
  }
  if (scorePercent >= 80 && !doc.basics.summary?.trim()) {
    hints.push('建议补充个人简介(summary)，便于 HR 快速了解你');
  }
  if (hints.length === 0) {
    hints.push('核心模块已较完整，可润色表述');
  }

  return {
    scorePercent,
    missingBasics,
    missingModules,
    hints,
    suggestionPhrases: buildResumeProgressFollowupPhrases(doc),
  };
}

export function formatResumeCompletionForPrompt(
  analysis: ResumeCompletionAnalysis,
): string {
  const lines = [
    `完成度约 ${analysis.scorePercent}%（规则估算，供引导参考）`,
    ...analysis.hints.map((h) => `- ${h}`),
  ];
  return lines.join('\n');
}

export function buildResumeAgentContext(
  doc: ResumeDocument,
  catalog: string,
): string {
  const analysis = analyzeResumeCompletion(doc);
  return [
    catalog,
    '',
    '## 完成度分析',
    formatResumeCompletionForPrompt(analysis),
  ].join('\n');
}
