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
        ? '先把基本信息填好，后面写经历会更顺。'
        : '补全或修改下面的基本信息即可。';
    case 'experience':
      return moduleMissingFromSummary(resumeSummary, 'experience')
        ? '来补一段工作经历，描述里尽量写成果。'
        : '再添加一段工作经历。';
    case 'education':
      return moduleMissingFromSummary(resumeSummary, 'education')
        ? '填一下教育背景即可。'
        : '再补一段教育经历。';
    case 'project':
      return moduleMissingFromSummary(resumeSummary, 'project')
        ? '写一条项目经历，说清你的角色和成果。'
        : '再添加一条项目经历。';
    case 'skill':
      return moduleMissingFromSummary(resumeSummary, 'skill')
        ? '把技能亮点写上，多项用换行分开。'
        : '再补充一些技能。';
    default:
      return '按下面提示填写即可。';
  }
}

/** 过短的模型回复（如「好的」）不用作引导语 */
function isAdequateModelLeadIn(text: string): boolean {
  const t = text.trim();
  if (t.length < 12) return false;
  if (/^(好的|好|行|可以|请填写|请输入)[。.!]?$/u.test(t)) return false;
  return true;
}

/** 表单卡片前的引导文案：模型一句优先，否则用短模板。不拼接两段，避免啰嗦。 */
export function buildFormCardLeadIn(input: {
  formType: FormCardType;
  modelResponseText?: string;
  resumeSummary?: string;
}): string {
  const fromModel = input.modelResponseText?.trim();
  if (fromModel && isAdequateModelLeadIn(fromModel)) {
    return fromModel;
  }
  return defaultLeadInTemplate(input.formType, input.resumeSummary);
}
