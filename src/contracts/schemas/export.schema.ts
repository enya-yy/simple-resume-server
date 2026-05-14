import { z } from 'zod';

import { JOB_STATUS, type JobStatus } from '../constants/job-status';

const jobStatusSchema = z.enum(JOB_STATUS);

export const createExportJobBodySchema = z.object({
  resumeId: z.string().uuid(),
});

export type CreateExportJobBody = z.infer<typeof createExportJobBodySchema>;

export const createExportJobResponseSchema = z.object({
  jobId: z.string().uuid(),
});

export type CreateExportJobResponse = z.infer<
  typeof createExportJobResponseSchema
>;

export const getExportJobResponseSchema = z
  .object({
    jobId: z.string().uuid(),
    status: jobStatusSchema,
    errorCode: z.string().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
    /** 仅 `succeeded` 且存在对象存储产物时由 API 签发短期预签名 GET */
    downloadUrl: z.string().url().optional(),
    /** 预签名 URL 剩余有效秒数（与 `downloadUrl` 成对出现） */
    downloadUrlExpiresInSeconds: z.number().int().positive().optional(),
  })
  .refine(
    (d) => {
      const hasUrl = d.downloadUrl !== undefined;
      const hasTtl = d.downloadUrlExpiresInSeconds !== undefined;
      return hasUrl === hasTtl;
    },
    {
      message:
        'downloadUrl and downloadUrlExpiresInSeconds must both be set or both omitted',
    },
  );

export type GetExportJobResponse = z.infer<typeof getExportJobResponseSchema>;

/** 供前端轮询：终态则停止 refetch */
export function isExportJobTerminalStatus(status: JobStatus): boolean {
  return (
    status === 'succeeded' || status === 'failed' || status === 'cancelled'
  );
}
