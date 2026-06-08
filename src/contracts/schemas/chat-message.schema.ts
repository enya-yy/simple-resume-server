import { z } from 'zod';

const formFieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  required: z.boolean().optional(),
  value: z.string().optional(),
});

const chatMessageAttachmentSchema = z.object({
  name: z.string(),
  mimeType: z.string().optional(),
  kind: z.string().optional(),
  /** 聊天附图暂存 objectKey（服务端可读） */
  objectKey: z.string().optional(),
});

export const textMessageSchema = z.object({
  type: z.literal('text'),
  role: z.enum(['user', 'assistant', 'system']),
  text: z.string(),
  suggestions: z.array(z.string()).optional(),
  attachments: z.array(chatMessageAttachmentSchema).optional(),
});

export const formCardMessageSchema = z.object({
  type: z.literal('form_card'),
  role: z.literal('assistant'),
  formType: z.string(),
  fields: z.array(formFieldSchema),
  /** 表单前的引导说明（展示在 FormCard 上方） */
  leadIn: z.string().optional(),
  submittedData: z.record(z.string(), z.string()).optional(),
});

export const layoutCommandMessageSchema = z.object({
  type: z.literal('layout_command'),
  role: z.literal('assistant'),
  command: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export const chatMessageContentSchema = z.discriminatedUnion('type', [
  textMessageSchema,
  formCardMessageSchema,
  layoutCommandMessageSchema,
]);

export const sendChatMessageBodySchema = z.object({
  content: z.string().min(1).max(5000),
  /**
   * `user` (default) — normal user input.
   * `system_event` — frontend-generated event (e.g. form saved successfully).
   * When `system_event`, the message is stored as `role: system` and triggers
   * a guidance-only LLM round without echoing back the raw content.
   */
  source: z.enum(['user', 'system_event']).optional().default('user'),
  /** 为 true 时不再插入用户消息（附图消息已单独持久化） */
  skipUserInsert: z.boolean().optional().default(false),
  /** 与 skipUserInsert 搭配，用于历史上下文排除 */
  existingUserMessageId: z.string().uuid().optional(),
});

export const insertImageChoiceMessagesResponseSchema = z.object({
  userMessageId: z.string().uuid(),
  assistantMessageId: z.string().uuid().optional(),
  stagingObjectKey: z.string(),
  suggestions: z.array(z.string()),
});

export const recordAvatarAppliedMessageResponseSchema = z.object({
  assistantMessageId: z.string().uuid(),
});

export type SendChatMessageBody = z.infer<typeof sendChatMessageBodySchema>;

/** PATCH assistant form_card message after user submits (persists submittedData for reload). */
export const patchChatFormCardMessageBodySchema = z.object({
  submittedData: z.record(z.string(), z.string()),
});

export type PatchChatFormCardMessageBody = z.infer<
  typeof patchChatFormCardMessageBodySchema
>;
