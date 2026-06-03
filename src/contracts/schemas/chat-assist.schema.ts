import { z } from 'zod';

import { JOB_STATUS, type JobStatus } from '../constants/job-status';

const jobStatusSchema = z.enum(JOB_STATUS);

export const CHAT_ASSIST_KIND = ['basics', 'experience', 'polish'] as const;
export type ChatAssistKind = (typeof CHAT_ASSIST_KIND)[number];

export const chatAssistKindSchema = z.enum(CHAT_ASSIST_KIND);

export const CHAT_ASSIST_POLISH_FIELD = ['summary', 'description'] as const;
export type ChatAssistPolishField = (typeof CHAT_ASSIST_POLISH_FIELD)[number];

const chatAssistSuggestionBodySchema = z.object({
  resumeId: z.string().uuid(),
  assistKind: z.enum(['basics', 'experience']),
  /** 业务定位：如 basics 场景的字段 key，或 experience 的模块提示；非完整对话正文 */
  targetHint: z.string().max(500).optional(),
  /** 用户主动提供的短上下文（长度受限），供模型参考 */
  contextHint: z.string().max(300).optional(),
});

const chatAssistPolishBodySchema = z.object({
  resumeId: z.string().uuid(),
  assistKind: z.literal('polish'),
  targetHint: z.enum(CHAT_ASSIST_POLISH_FIELD),
  /** 待润色原文（写入任务 context_hint 列） */
  sourceText: z.string().trim().min(1).max(8000),
});

export const createChatAssistJobBodySchema = z.union([
  chatAssistSuggestionBodySchema,
  chatAssistPolishBodySchema,
]);

export type CreateChatAssistJobBody = z.infer<
  typeof createChatAssistJobBodySchema
>;

export const createChatAssistJobResponseSchema = z.object({
  jobId: z.string().uuid(),
});

export type CreateChatAssistJobResponse = z.infer<
  typeof createChatAssistJobResponseSchema
>;

export const getChatAssistJobResponseSchema = z.object({
  jobId: z.string().uuid(),
  status: jobStatusSchema,
  requestId: z.string().optional(),
  assistKind: chatAssistKindSchema,
  targetHint: z.string().nullable().optional(),
  suggestionText: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
});

export type GetChatAssistJobResponse = z.infer<
  typeof getChatAssistJobResponseSchema
>;

export function isChatAssistJobTerminalStatus(status: JobStatus): boolean {
  return (
    status === 'succeeded' || status === 'failed' || status === 'cancelled'
  );
}
