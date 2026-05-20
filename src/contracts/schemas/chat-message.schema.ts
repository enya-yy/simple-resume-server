import { z } from 'zod';

const formFieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  required: z.boolean().optional(),
  value: z.string().optional(),
});

export const textMessageSchema = z.object({
  type: z.literal('text'),
  role: z.enum(['user', 'assistant', 'system']),
  text: z.string(),
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
});

export type SendChatMessageBody = z.infer<typeof sendChatMessageBodySchema>;

/** PATCH assistant form_card message after user submits (persists submittedData for reload). */
export const patchChatFormCardMessageBodySchema = z.object({
  submittedData: z.record(z.string(), z.string()),
});

export type PatchChatFormCardMessageBody = z.infer<
  typeof patchChatFormCardMessageBodySchema
>;
