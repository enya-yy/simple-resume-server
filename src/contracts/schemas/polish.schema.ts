import { z } from 'zod';

import { JOB_STATUS, type JobStatus } from '../constants/job-status';

const jobStatusSchema = z.enum(JOB_STATUS);

/**
 * 条目定位：moduleId + itemId 唯一确定一个条目。
 * 可选 bulletIndex 指定具体要点（-1 或省略表示整个条目标题+所有要点）。
 */
export const polishTargetSchema = z.object({
  moduleId: z.string().min(1),
  itemId: z.string().min(1),
  bulletIndex: z.number().int().min(-1).optional(),
});

export type PolishTarget = z.infer<typeof polishTargetSchema>;

export const createPolishJobBodySchema = z.object({
  resumeId: z.string().uuid(),
  target: polishTargetSchema,
});

export type CreatePolishJobBody = z.infer<typeof createPolishJobBodySchema>;

export const createPolishJobResponseSchema = z.object({
  jobId: z.string().uuid(),
});

export type CreatePolishJobResponse = z.infer<
  typeof createPolishJobResponseSchema
>;

export const getPolishJobResponseSchema = z.object({
  jobId: z.string().uuid(),
  status: jobStatusSchema,
  requestId: z.string().optional(),
  originalText: z.string().nullable().optional(),
  polishedText: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
});

export type GetPolishJobResponse = z.infer<typeof getPolishJobResponseSchema>;

export function isPolishJobTerminalStatus(status: JobStatus): boolean {
  return (
    status === 'succeeded' || status === 'failed' || status === 'cancelled'
  );
}
