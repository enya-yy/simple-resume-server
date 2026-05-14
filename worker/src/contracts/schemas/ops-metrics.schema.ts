import { z } from "zod";
import type { JobStatus } from "../constants/job-status.js";

/** 运营聚合任务类型（不含 chat_assist，见 Story 7.1 边界） */
export const opsMetricsTaskTypeSchema = z.enum(["export", "polish"]);
export type OpsMetricsTaskType = z.infer<typeof opsMetricsTaskTypeSchema>;

/** 查询参数：ISO-8601 UTC 字符串 */
export const opsMetricsQuerySchema = z
  .object({
    taskType: opsMetricsTaskTypeSchema,
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
  })
  .superRefine((val, ctx) => {
    const fromMs = Date.parse(val.from);
    const toMs = Date.parse(val.to);
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "from/to 无法解析为有效时间",
      });
      return;
    }
    if (fromMs >= toMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "from 必须早于 to",
      });
    }
    const maxMs = 90 * 24 * 60 * 60 * 1000;
    if (toMs - fromMs > maxMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "时间范围不得超过 90 天",
      });
    }
  });

export type OpsMetricsQuery = z.infer<typeof opsMetricsQuerySchema>;

/**
 * 各状态计数（含非终态 queued / running）。
 */
export const opsMetricsStatusCountsSchema = z.object({
  queued: z.number().int().nonnegative(),
  running: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
});

export type OpsMetricsStatusCounts = z.infer<typeof opsMetricsStatusCountsSchema>;

/**
 * 成功率 / 失败率 **分母**仅含终态：`succeeded | failed | cancelled`（与 Story 任务说明一致）。
 * `queued` / `running` 不计入分母；比率为 0–1 的 number。
 */
export const opsMetricsResponseSchema = z.object({
  taskType: opsMetricsTaskTypeSchema,
  window: z.object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
  }),
  statusCounts: opsMetricsStatusCountsSchema,
  /** 终态作业总数 = succeeded + failed + cancelled */
  terminalTotal: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  failureRate: z.number().min(0).max(1),
  /** 失败/取消作业按 error_code 聚合（主键为工程稳定码；空值用 OPS_AGGREGATE_NO_ERROR_CODE） */
  errorCodeCounts: z.array(
    z.object({
      errorCode: z.string().min(1),
      count: z.number().int().nonnegative(),
    }),
  ),
});

export type OpsMetricsResponse = z.infer<typeof opsMetricsResponseSchema>;

const ZERO_STATUS: Record<JobStatus, number> = {
  queued: 0,
  running: 0,
  succeeded: 0,
  failed: 0,
  cancelled: 0,
};

/**
 * 将 SQL 聚合得到的各 status 计数与 error_code 分布整理为 API 响应（含成功率/失败率口径）。
 */
export function finalizeOpsMetricsResponse(input: {
  taskType: OpsMetricsTaskType;
  window: { from: string; to: string };
  /** 来自 GROUP BY status 的原始计数，缺省状态视为 0 */
  rawStatusCounts: Partial<Record<JobStatus, number>>;
  errorCodeCounts: { errorCode: string; count: number }[];
}): OpsMetricsResponse {
  const statusCounts = { ...ZERO_STATUS };
  for (const k of Object.keys(ZERO_STATUS) as JobStatus[]) {
    const n = input.rawStatusCounts[k];
    if (typeof n === "number" && Number.isFinite(n)) {
      statusCounts[k] = n;
    }
  }
  const { succeeded, failed, cancelled } = statusCounts;
  const terminalTotal = succeeded + failed + cancelled;
  const successRate = terminalTotal === 0 ? 0 : succeeded / terminalTotal;
  const failureRate = terminalTotal === 0 ? 0 : failed / terminalTotal;
  return opsMetricsResponseSchema.parse({
    taskType: input.taskType,
    window: input.window,
    statusCounts,
    terminalTotal,
    successRate,
    failureRate,
    errorCodeCounts: input.errorCodeCounts,
  });
}
