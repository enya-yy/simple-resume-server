import { z } from 'zod';

export const requestIdLookupRequestSchema = z.object({
  requestId: z.string().uuid(),
});

export type RequestIdLookupRequest = z.infer<
  typeof requestIdLookupRequestSchema
>;

const jobDiagnosticSchema = z.object({
  jobId: z.string().uuid(),
  jobType: z.enum(['export', 'polish']),
  status: z.string().min(1),
  errorCode: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }).nullable(),
});

export type JobDiagnostic = z.infer<typeof jobDiagnosticSchema>;

export const requestIdLookupResultSchema = z.object({
  requestId: z.string().uuid(),
  found: z.literal(true),
  /** Earliest occurrence timestamp across all matched jobs */
  occurredAt: z.string().datetime({ offset: true }),
  jobs: z.array(jobDiagnosticSchema).min(1),
});

export type RequestIdLookupResult = z.infer<typeof requestIdLookupResultSchema>;

export const requestIdLookupNotFoundSchema = z.object({
  requestId: z.string().uuid(),
  found: z.literal(false),
});

export type RequestIdLookupNotFound = z.infer<
  typeof requestIdLookupNotFoundSchema
>;

export const requestIdLookupResponseSchema = z.discriminatedUnion('found', [
  requestIdLookupResultSchema,
  requestIdLookupNotFoundSchema,
]);

export type RequestIdLookupResponse = z.infer<
  typeof requestIdLookupResponseSchema
>;
