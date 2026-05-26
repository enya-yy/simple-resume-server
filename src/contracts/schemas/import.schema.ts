import { z } from 'zod';

import { JOB_STATUS, type JobStatus } from '../constants/job-status';

const jobStatusSchema = z.enum(JOB_STATUS);

export const IMPORT_SOURCE_KINDS = ['file', 'paste'] as const;
export type ImportSourceKind = (typeof IMPORT_SOURCE_KINDS)[number];

export const createImportJobResponseSchema = z.object({
  jobId: z.string().uuid(),
  resumeId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

export type CreateImportJobResponse = z.infer<
  typeof createImportJobResponseSchema
>;

export const getImportJobResponseSchema = z.object({
  jobId: z.string().uuid(),
  status: jobStatusSchema,
  resumeId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
});

export type GetImportJobResponse = z.infer<typeof getImportJobResponseSchema>;

/** 供前端轮询：终态则停止 refetch */
export function isImportJobTerminalStatus(status: JobStatus): boolean {
  return (
    status === 'succeeded' || status === 'failed' || status === 'cancelled'
  );
}

/** API 层允许上传的 MIME 类型 */
export const IMPORT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type ImportAllowedMimeType = (typeof IMPORT_ALLOWED_MIME_TYPES)[number];
