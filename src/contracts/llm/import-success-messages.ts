import {
  analyzeResumeCompletion,
  type ResumeCompletionAnalysis,
} from './resume-completion';
import { buildFormCardLeadIn } from './form-card-lead-in';
import { buildResumeSummary } from './resume-summary';
import type { FormField } from '../types/chat-message';
import type { ResumeDocument, ResumeModuleType } from '../types/resume';

export type ImportSuccessChatInsert = {
  contentType: 'text' | 'form_card';
  contentJson: Record<string, unknown>;
};

const BASIC_INFO_FIELDS: FormField[] = [
  { name: 'fullName', label: '姓名', required: true },
  { name: 'email', label: '邮箱', required: true },
  { name: 'phone', label: '手机', required: true },
  { name: 'location', label: '工作城市' },
  { name: 'headline', label: '期望职位' },
  { name: 'summary', label: '简介' },
];

const MODULE_LABELS: Record<ResumeModuleType, string> = {
  experience: '工作经历',
  education: '教育经历',
  project: '项目经验',
  skill: '技能',
  custom: '自定义模块',
};

function sectionItemCount(doc: ResumeDocument, type: ResumeModuleType): number {
  let n = 0;
  for (const s of doc.sections) {
    if (s.type === type) n += s.items.length;
  }
  return n;
}

function latestSectionTitle(
  doc: ResumeDocument,
  type: ResumeModuleType,
): string | undefined {
  for (const s of doc.sections) {
    if (s.type === type && s.items.length > 0) {
      return s.items[0]?.title?.trim() || undefined;
    }
  }
  return undefined;
}

function formatBasicsLine(doc: ResumeDocument): string {
  const b = doc.basics;
  const parts: string[] = [];
  if (b.fullName?.trim()) parts.push(b.fullName.trim());
  if (b.headline?.trim()) parts.push(b.headline.trim());
  if (b.email?.trim()) parts.push(b.email.trim());
  if (b.phone?.trim()) parts.push(b.phone.trim());
  if (b.location?.trim()) parts.push(b.location.trim());
  if (parts.length === 0) return '暂未识别到';
  return parts.join(' · ');
}

function formatModuleLine(
  doc: ResumeDocument,
  type: ResumeModuleType,
): string {
  const count = sectionItemCount(doc, type);
  if (count === 0) return '暂未识别到';
  const latest = latestSectionTitle(doc, type);
  const suffix = latest ? `（最近：${latest}）` : '';
  return `${count} 条${suffix}`;
}

function buildImportSummaryText(doc: ResumeDocument): string {
  const lines = [
    '我这边读到这些主要内容：',
    '',
    `· 基本信息：${formatBasicsLine(doc)}`,
    `· ${MODULE_LABELS.experience}：${formatModuleLine(doc, 'experience')}`,
    `· ${MODULE_LABELS.education}：${formatModuleLine(doc, 'education')}`,
    `· ${MODULE_LABELS.project}：${formatModuleLine(doc, 'project')}`,
    `· ${MODULE_LABELS.skill}：${formatModuleLine(doc, 'skill')}`,
  ];
  return lines.join('\n');
}

function buildNextStepsText(analysis: ResumeCompletionAnalysis): string {
  const lines = [
    `当前完成度约 ${analysis.scorePercent}%（规则估算，供参考）。`,
  ];

  if (analysis.hints.length > 0) {
    lines.push('', '还建议你重点看看：', ...analysis.hints.map((h) => `· ${h}`));
  }

  lines.push(
    '',
    '直接在聊天里告诉我你想先改哪一块，或在右侧预览里点编辑即可。',
  );
  return lines.join('\n');
}

function shouldOfferBasicInfoForm(analysis: ResumeCompletionAnalysis): boolean {
  const critical = ['姓名', '邮箱', '手机'];
  return analysis.missingBasics.some((label) => critical.includes(label));
}

function buildBasicInfoFormCard(
  doc: ResumeDocument,
  resumeSummary: string,
): ImportSuccessChatInsert {
  const b = doc.basics;
  const fields = BASIC_INFO_FIELDS.map((f) => ({
    ...f,
    value: b[f.name as keyof typeof b]?.trim() || undefined,
  }));

  return {
    contentType: 'form_card',
    contentJson: {
      type: 'form_card',
      role: 'assistant',
      formType: 'basic_info',
      fields,
      leadIn: buildFormCardLeadIn({
        formType: 'basic_info',
        resumeSummary,
      }),
    },
  };
}

/**
 * 导入成功后写入会话的多条助手消息：欢迎语、识别摘要、后续建议，必要时附带基本信息表单。
 */
export function buildImportSuccessChatMessages(
  doc: ResumeDocument,
): ImportSuccessChatInsert[] {
  const analysis = analyzeResumeCompletion(doc);
  const resumeSummary = buildResumeSummary(doc);

  const messages: ImportSuccessChatInsert[] = [
    {
      contentType: 'text',
      contentJson: {
        type: 'text',
        role: 'assistant',
        text: '已帮你从旧简历里识别并导入内容。右侧预览区可以核对每一节，有需要随时告诉我。',
      },
    },
    {
      contentType: 'text',
      contentJson: {
        type: 'text',
        role: 'assistant',
        text: buildImportSummaryText(doc),
      },
    },
    {
      contentType: 'text',
      contentJson: {
        type: 'text',
        role: 'assistant',
        text: buildNextStepsText(analysis),
        suggestions: analysis.suggestionPhrases,
      },
    },
  ];

  if (shouldOfferBasicInfoForm(analysis)) {
    messages.push(buildBasicInfoFormCard(doc, resumeSummary));
  }

  return messages;
}
