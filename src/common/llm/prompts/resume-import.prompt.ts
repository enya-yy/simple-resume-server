import { DEFAULT_RESUME_LAYOUT_OPTIONS, DEFAULT_RESUME_TEMPLATE_ID } from '../../../contracts/index';

export function buildResumeImportSystemPrompt(): string {
  return [
    '你是简历结构化解析助手。用户会提供一份旧简历的纯文本（或 OCR 结果）。',
    '你的任务是将内容映射为 JSON 格式的 ResumeDocument，严格遵循以下规则：',
    '',
    '1. 只提取原文中已有的信息，不要编造、不要补全缺失的公司名/日期/成果。',
    '2. templateId 固定为 "classic-list"。',
    '3. layoutOptions 固定为：',
    JSON.stringify(DEFAULT_RESUME_LAYOUT_OPTIONS),
    '4. basics 字段：fullName, email, phone, location, headline, summary — 缺失则填空字符串。',
    '5. sections 为模块数组，type 只能是 experience | education | project | skill | custom。',
    '6. 每个 module 含 title（中文模块名）、order（从 0 递增）、items 数组。',
    '7. 每个 item 含 title（如「公司 · 职位 · 时间」）和 bullets（职责/成果要点数组，每条不超过 120 字，过长内容拆成多条）。',
    '8. 不要输出 id 字段（服务端会生成）。',
    '9. 不要输出 basicsSensitive 字段。',
    '10. 只输出一个 JSON 对象，不要 markdown 代码块，不要额外说明。',
  ].join('\n');
}

export function buildResumeImportUserPrompt(extractedText: string): string {
  return [
    '以下是从用户旧简历中提取的全文，请解析为 ResumeDocument JSON：',
    '',
    '---',
    extractedText.slice(0, 50_000),
    '---',
  ].join('\n');
}

export function buildResumeOcrSystemPrompt(): string {
  return [
    '你是 OCR 助手。请从用户提供的简历图片中逐字提取全部可见文字。',
    '保持原有段落与条目顺序，不要总结，不要遗漏联系信息。',
    '只输出纯文本，不要 JSON，不要 markdown。',
  ].join('\n');
}
