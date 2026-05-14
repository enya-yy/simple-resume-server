import { z } from 'zod';

import {
  resumeDocumentSchema,
  resumeIdSchema,
  resumeLayoutOptionsStrictSchema,
  resumeTemplateIdSchema,
} from './resume.schema';

export const createShareBodySchema = z.object({
  resumeId: resumeIdSchema,
  password: z.string().min(4).max(128).optional(),
  expiresAt: z.string().datetime().optional(),
});

export type CreateShareBody = z.infer<typeof createShareBodySchema>;

export const createShareResponseSchema = z.object({
  shareId: z.string().uuid(),
  shareUrl: z.string().url(),
  passwordEnabled: z.boolean(),
  expirationEnabled: z.boolean(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type CreateShareResponse = z.infer<typeof createShareResponseSchema>;

export const shareReadOnlyResponseSchema = z.object({
  document: resumeDocumentSchema,
  templateId: resumeTemplateIdSchema,
  layoutOptions: resumeLayoutOptionsStrictSchema,
});

export type ShareReadOnlyResponse = z.infer<typeof shareReadOnlyResponseSchema>;

export const verifySharePasswordBodySchema = z.object({
  password: z.string().min(1).max(128),
});

export type VerifySharePasswordBody = z.infer<
  typeof verifySharePasswordBodySchema
>;

export const verifySharePasswordResponseSchema = z.object({
  verified: z.literal(true),
});

export type VerifySharePasswordResponse = z.infer<
  typeof verifySharePasswordResponseSchema
>;

export const shareMetaResponseSchema = z.object({
  passwordRequired: z.boolean(),
  expiresAt: z.string().datetime().nullable(),
});

export type ShareMetaResponse = z.infer<typeof shareMetaResponseSchema>;
