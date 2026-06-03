import { z } from 'zod';

export const adminLlmUsageBySourceSchema = z.object({
  source: z.string(),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  callCount: z.number().int().nonnegative(),
});

export const adminLlmUsageSummarySchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  callCount: z.number().int().nonnegative(),
  bySource: z.array(adminLlmUsageBySourceSchema),
  from: z.string().nullable(),
  to: z.string().nullable(),
});

export const adminLlmUsageUserRowSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  callCount: z.number().int().nonnegative(),
  lastUsedAt: z.string().nullable(),
});

export const adminLlmUsageUsersResponseSchema = z.object({
  items: z.array(adminLlmUsageUserRowSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  from: z.string().nullable(),
  to: z.string().nullable(),
});

export const adminUserLlmUsageStatsSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  callCount: z.number().int().nonnegative(),
  lastUsedAt: z.string().nullable(),
});

export type AdminLlmUsageSummary = z.infer<typeof adminLlmUsageSummarySchema>;
export type AdminLlmUsageUsersResponse = z.infer<
  typeof adminLlmUsageUsersResponseSchema
>;
