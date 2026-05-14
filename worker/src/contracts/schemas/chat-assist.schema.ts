import { z } from "zod";

import { JOB_STATUS, type JobStatus } from "../constants/job-status.js";

const jobStatusSchema = z.enum(JOB_STATUS);

export const CHAT_ASSIST_KIND = ["basics", "experience"] as const;
export type ChatAssistKind = (typeof CHAT_ASSIST_KIND)[number];

export const chatAssistKindSchema = z.enum(CHAT_ASSIST_KIND);

export const createChatAssistJobBodySchema = z.object({
  resumeId: z.string().uuid(),
  assistKind: chatAssistKindSchema,
  /** 业务定位：如 basics 场景的字段 key，或 experience 的模块提示；非完整对话正文 */
  targetHint: z.string().max(500).optional(),
  /** 用户主动提供的短上下文（长度受限），供模型参考 */
  contextHint: z.string().max(300).optional(),
});

export type CreateChatAssistJobBody = z.infer<typeof createChatAssistJobBodySchema>;

export const createChatAssistJobResponseSchema = z.object({
  jobId: z.string().uuid(),
});

export type CreateChatAssistJobResponse = z.infer<typeof createChatAssistJobResponseSchema>;

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

export type GetChatAssistJobResponse = z.infer<typeof getChatAssistJobResponseSchema>;

export function isChatAssistJobTerminalStatus(status: JobStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}
