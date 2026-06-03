export type TextMessage = {
  type: 'text';
  role: 'user' | 'assistant' | 'system';
  text: string;
  /** 持久化在消息里的「猜你想做」快捷短语（如导入完成引导） */
  suggestions?: string[];
};

export type FormField = {
  name: string;
  label: string;
  required?: boolean;
  value?: string;
};

export type FormCardMessage = {
  type: 'form_card';
  role: 'assistant';
  formType: string;
  fields: FormField[];
  /** 表单前的引导说明 */
  leadIn?: string;
  submittedData?: Record<string, string>;
};

export type LayoutCommandMessage = {
  type: 'layout_command';
  role: 'assistant';
  command: string;
  params?: Record<string, unknown>;
};

export type ChatMessage = TextMessage | FormCardMessage | LayoutCommandMessage;

export type ChatMessageRole = 'user' | 'assistant' | 'system';

/** DB row shape returned by the API (camelCase, with metadata) */
export interface ChatMessageRow {
  id: string;
  sessionId: string;
  role: ChatMessageRole;
  contentType: 'text' | 'form_card' | 'layout_command';
  contentJson: ChatMessage;
  intent?: string | null;
  createdAt: string;
}
