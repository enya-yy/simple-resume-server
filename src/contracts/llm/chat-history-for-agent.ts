import type { ChatMessageRole } from '../types/chat-message';

export const CHAT_HISTORY_MAX_MESSAGES = 12;
export const CHAT_HISTORY_MAX_TOKENS = 2000;
const USER_MAX_CHARS = 500;
const ASSISTANT_MAX_CHARS = 200;
const MIN_MESSAGES_AFTER_TRIM = 4;

export type ResumeAgentChatTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type ChatHistorySourceMessage = {
  role: ChatMessageRole;
  content_type: 'text' | 'form_card' | 'layout_command';
  content_json: Record<string, unknown>;
};

const FORM_TYPE_LABEL: Record<string, string> = {
  basic_info: '基础信息',
  experience: '工作经历',
  education: '教育背景',
  project: '项目经验',
  skill: '技能',
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 1.8);
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function textFromContentJson(
  role: ChatMessageRole,
  contentType: ChatHistorySourceMessage['content_type'],
  contentJson: Record<string, unknown>,
): string | null {
  const type = contentJson.type;

  if (contentType === 'text' || type === 'text') {
    const text = typeof contentJson.text === 'string' ? contentJson.text.trim() : '';
    if (!text) return null;
    if (role === 'system') {
      return text.startsWith('[系统事件]') ? text : `[系统事件] ${text}`;
    }
    return text;
  }

  if (contentType === 'form_card' || type === 'form_card') {
    const formType =
      typeof contentJson.formType === 'string' ? contentJson.formType : 'unknown';
    const label = FORM_TYPE_LABEL[formType] ?? formType;
    const leadIn =
      typeof contentJson.leadIn === 'string' ? contentJson.leadIn.trim() : '';
    const submitted =
      contentJson.submittedData &&
      typeof contentJson.submittedData === 'object' &&
      Object.keys(contentJson.submittedData as object).length > 0;
    if (submitted) {
      return `[已提交 ${label} 表单]`;
    }
    return leadIn
      ? `[已展示 ${label} 表单，引导：${truncate(leadIn, 60)}]`
      : `[已展示 ${label} 表单]`;
  }

  if (contentType === 'layout_command' || type === 'layout_command') {
    const command =
      typeof contentJson.command === 'string' ? contentJson.command : 'unknown';
    return `[已执行命令：${command}]`;
  }

  return null;
}

function toAgentTurn(msg: ChatHistorySourceMessage): ResumeAgentChatTurn | null {
  const content = textFromContentJson(msg.role, msg.content_type, msg.content_json);
  if (!content) return null;

  const role: ResumeAgentChatTurn['role'] =
    msg.role === 'assistant' ? 'assistant' : 'user';
  const max = role === 'user' ? USER_MAX_CHARS : ASSISTANT_MAX_CHARS;
  return { role, content: truncate(content, max) };
}

function trimToTokenBudget(
  turns: ResumeAgentChatTurn[],
  maxTokens: number,
): ResumeAgentChatTurn[] {
  if (turns.length === 0) return turns;

  let selected = [...turns];
  while (selected.length > MIN_MESSAGES_AFTER_TRIM) {
    const total = selected.reduce((sum, t) => sum + estimateTokens(t.content), 0);
    if (total <= maxTokens) break;
    selected = selected.slice(1);
  }
  return selected;
}

/** 将最近会话消息转为 LLM 可注入的历史（压缩表单/命令，条数与 token 双限）。 */
export function buildChatHistoryForAgent(
  messages: ChatHistorySourceMessage[],
  options?: {
    maxMessages?: number;
    maxTokens?: number;
  },
): ResumeAgentChatTurn[] {
  const maxMessages = options?.maxMessages ?? CHAT_HISTORY_MAX_MESSAGES;
  const maxTokens = options?.maxTokens ?? CHAT_HISTORY_MAX_TOKENS;

  const turns = messages
    .slice(-maxMessages)
    .map(toAgentTurn)
    .filter((t): t is ResumeAgentChatTurn => t !== null);

  return trimToTokenBudget(turns, maxTokens);
}

export function estimateChatHistoryTokens(
  history: ResumeAgentChatTurn[],
): number {
  return history.reduce((sum, t) => sum + estimateTokens(t.content), 0);
}
