import { z } from "zod";

export const createChatSessionBodySchema = z.object({
  resumeId: z.string().uuid(),
  title: z.string().max(200).optional(),
});

export const patchChatSessionBodySchema = z.object({
  title: z.string().min(1).max(200),
});

export const chatSessionSchema = z.object({
  sessionId: z.string().uuid(),
  resumeId: z.string().uuid(),
  title: z.string(),
  lastMessageSummary: z.string(),
  updatedAt: z.string(),
});

export const listChatSessionsResponseSchema = z.object({
  sessions: z.array(chatSessionSchema),
});

export const patchChatSessionResponseSchema = chatSessionSchema;

export type ChatSession = z.infer<typeof chatSessionSchema>;
export type ListChatSessionsResponse = z.infer<typeof listChatSessionsResponseSchema>;
export type CreateChatSessionBody = z.infer<typeof createChatSessionBodySchema>;
export type PatchChatSessionBody = z.infer<typeof patchChatSessionBodySchema>;
