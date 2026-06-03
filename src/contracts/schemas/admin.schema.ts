import { z } from 'zod';
import { USER_PLANS } from '../constants/credit-actions';
import { USER_ROLES } from '../constants/user-roles';
import { adminUserLlmUsageStatsSchema } from './admin-llm-usage.schema';

export const adminUserListItemSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum([USER_ROLES.USER, USER_ROLES.ADMIN]),
  plan: z.enum([USER_PLANS.TRIAL, USER_PLANS.SUBSCRIBED]),
  creditsBalance: z.number().int(),
  disabledAt: z.string().nullable(),
  lastAccessAt: z.string().nullable(),
  createdAt: z.string(),
});

export const adminUsersListResponseSchema = z.object({
  items: z.array(adminUserListItemSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

export const adminUserStatsSchema = z.object({
  resumeCount: z.number().int().nonnegative(),
  chatSessionCount: z.number().int().nonnegative(),
  lastActivityAt: z.string().nullable(),
  llmUsage: adminUserLlmUsageStatsSchema,
});

export const adminUserDetailSchema = adminUserListItemSchema.extend({
  updatedAt: z.string(),
  stats: adminUserStatsSchema,
});

export const patchAdminUserBodySchema = z
  .object({
    plan: z.enum([USER_PLANS.TRIAL, USER_PLANS.SUBSCRIBED]).optional(),
    disabled: z.boolean().optional(),
  })
  .refine((b) => b.plan !== undefined || b.disabled !== undefined, {
    message: '至少提供 plan 或 disabled',
  });

export const adjustAdminCreditsBodySchema = z.object({
  delta: z.number().int().refine((n) => n !== 0, { message: 'delta 不能为 0' }),
  note: z.string().max(500).optional(),
});

export const creditLedgerEntrySchema = z.object({
  id: z.string().uuid(),
  delta: z.number().int(),
  reason: z.string(),
  refId: z.string().nullable(),
  balanceAfter: z.number().int(),
  createdAt: z.string(),
});

export const adminCreditLedgerResponseSchema = z.object({
  items: z.array(creditLedgerEntrySchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

export type AdminUserListItem = z.infer<typeof adminUserListItemSchema>;
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;
export type CreditLedgerEntry = z.infer<typeof creditLedgerEntrySchema>;
