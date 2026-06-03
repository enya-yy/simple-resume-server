export type FormCardType =
  | 'basic_info'
  | 'experience'
  | 'education'
  | 'project'
  | 'skill';

function basicsMissingFromSummary(resumeSummary?: string): boolean {
  if (!resumeSummary) return true;
  return /基本信息.*未填写|basics\).*未填/i.test(resumeSummary);
}

function moduleMissingFromSummary(
  resumeSummary: string | undefined,
  moduleKey: FormCardType,
): boolean {
  if (!resumeSummary) return true;
  const patterns: Record<FormCardType, RegExp> = {
    basic_info: /基本信息.*未填写/,
    experience: /工作经验.*缺失|experience\).*0条/,
    education: /教育经历.*缺失|education\).*0条/,
    project: /项目经验.*缺失|project\).*0条/,
    skill: /技能.*缺失|skill\).*0条/,
  };
  return patterns[moduleKey].test(resumeSummary);
}

function defaultLeadInTemplate(
  formType: FormCardType,
  resumeSummary?: string,
): string {
  switch (formType) {
    case 'basic_info':
      return basicsMissingFromSummary(resumeSummary)
        ? [
            '## 先完善基本信息',
            '',
            '这是简历的「门面」，填好后写经历会更顺。',
            '',
            '**建议优先填写：**',
            '- 姓名与联系方式',
            '- 期望职位',
          ].join('\n')
        : [
            '## 更新基本信息',
            '',
            '在下方修改字段，保存后会**自动同步**到右侧预览。',
          ].join('\n');
    case 'experience':
      return moduleMissingFromSummary(resumeSummary, 'experience')
        ? [
            '## 添加工作经历',
            '',
            '尽量用**成果导向**的描述，突出你的贡献与影响。',
            '',
            '**填写建议：**',
            '- 公司名 + 职位 + 时间段',
            '- 职责与成果分点描述',
          ].join('\n')
        : [
            '## 再添加一段工作经历',
            '',
            '继续补充经历，让简历更完整、更有说服力。',
          ].join('\n');
    case 'education':
      return moduleMissingFromSummary(resumeSummary, 'education')
        ? [
            '## 填写教育背景',
            '',
            '学校、专业与时间段写清楚即可。',
          ].join('\n')
        : '## 补充教育经历\n\n再添加一段教育背景。';
    case 'project':
      return moduleMissingFromSummary(resumeSummary, 'project')
        ? [
            '## 添加项目经历',
            '',
            '说清**你的角色**和**具体成果**，比堆技术名词更有说服力。',
          ].join('\n')
        : '## 再添加项目经历\n\n补充一条项目，突出你的贡献。';
    case 'skill':
      return moduleMissingFromSummary(resumeSummary, 'skill')
        ? [
            '## 填写技能亮点',
            '',
            '列出与目标岗位最相关的技能，**多项用换行分开**。',
          ].join('\n')
        : '## 补充技能\n\n再添加一些与岗位匹配的技能。';
    default:
      return '## 请填写以下内容\n\n按下方提示完成即可。';
  }
}

/** 过短的模型回复（如「好的」）不用作引导语 */
function isAdequateModelLeadIn(text: string): boolean {
  const t = text.trim();
  if (t.length < 12) return false;
  if (/^(好的|好|行|可以|请填写|请输入)[。.!]?$/u.test(t)) return false;
  return true;
}

/** 表单卡片前的引导文案：模型一句优先，否则用 Markdown 模板。 */
export function buildFormCardLeadIn(input: {
  formType: FormCardType;
  modelResponseText?: string;
  resumeSummary?: string;
}): string {
  const fromModel = input.modelResponseText?.trim();
  if (fromModel && isAdequateModelLeadIn(fromModel)) {
    return fromModel.startsWith('#')
      ? fromModel
      : `## 请完善以下内容\n\n${fromModel}`;
  }
  return defaultLeadInTemplate(input.formType, input.resumeSummary);
}
