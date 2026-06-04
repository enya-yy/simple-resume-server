import type { ResumeToolCall } from './resume-agent-tools';

const YEAR_RANGE = /(\d{4})\s*[-—~至到]\s*(\d{4})/;
const SCHOOL_HINT =
  /(?:大学|学院|中学|(?:[一二三四五六七八九十]|\d+)中|学校|高职|技校|研究生院|附属)/;
const DEGREE_HINT = /(博士|研究生|硕士|本科|专科|中专|高中)/;

function formatYearRange(start: string, end: string): string {
  return `${start} — ${end}`;
}

function inferDegreeLabel(school: string, text: string): string | undefined {
  const explicit = text.match(DEGREE_HINT)?.[1];
  if (explicit) return explicit;
  if (/一中|二中|三中|中学|高级中学|高中/.test(school)) return '高中';
  return undefined;
}

function extractSchoolName(text: string): string | null {
  const afterAt = text.match(/在([^，,。；;\n]+?)(?:就读|读书|学习|读|毕业)/);
  if (afterAt?.[1]?.trim()) return afterAt[1].trim();

  const studyAt = text.match(/就读于\s*([^，,。；;\n]+)/);
  if (studyAt?.[1]?.trim()) return studyAt[1].trim();

  const named = text.match(
    /([\u4e00-\u9fa5]{2,40}(?:大学|学院|中学|(?:[一二三四五六七八九十]|\d+)中|学校)[\u4e00-\u9fa5]{0,20})/,
  );
  if (named?.[1]?.trim()) return named[1].trim();

  return null;
}

function educationSignalCount(text: string): number {
  let count = 0;
  if (extractSchoolName(text) || SCHOOL_HINT.test(text)) count += 1;
  if (YEAR_RANGE.test(text)) count += 1;
  if (DEGREE_HINT.test(text)) count += 1;
  return count;
}

/** 模型未写入教育经历时，从自然语言推断 add_section_item(education)。 */
export function tryInferEducationAddFromMessage(
  userMessage: string,
): ResumeToolCall | null {
  const text = userMessage.trim();
  if (!text || text.startsWith('[系统事件]')) return null;
  if (educationSignalCount(text) < 2) return null;

  const school = extractSchoolName(text);
  if (!school) return null;

  const yearMatch = text.match(YEAR_RANGE);
  const bullets: string[] = [];
  const degree = inferDegreeLabel(school, text);
  if (degree) bullets.push(degree);
  if (yearMatch) {
    bullets.push(formatYearRange(yearMatch[1]!, yearMatch[2]!));
  } else if (!degree) {
    return null;
  }

  return {
    name: 'add_section_item',
    arguments: {
      moduleType: 'education',
      item: {
        title: school.slice(0, 120),
        bullets,
      },
    },
  };
}
