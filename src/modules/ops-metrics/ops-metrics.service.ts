import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import {
  ERROR_CODES,
  finalizeOpsMetricsResponse,
  opsMetricsQuerySchema,
  type OpsMetricsResponse,
  type OpsMetricsTaskType,
} from '../../contracts/index';
import { OpsMetricsRepository } from './ops-metrics.repository';

@Injectable()
export class OpsMetricsService {
  private readonly logger = new Logger(OpsMetricsService.name);

  constructor(private readonly repo: OpsMetricsRepository) {}

  async getMetrics(
    req: Request,
    query: Record<string, string | string[] | undefined>,
  ): Promise<OpsMetricsResponse> {
    const parsed = opsMetricsQuerySchema.safeParse({
      taskType: typeof query.taskType === 'string' ? query.taskType : undefined,
      from: typeof query.from === 'string' ? query.from : undefined,
      to: typeof query.to === 'string' ? query.to : undefined,
    });
    if (!parsed.success) {
      const msg = parsed.error.flatten().formErrors.join('; ') || '参数无效';
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: msg,
      });
    }
    const { taskType, from, to } = parsed.data;
    const fromIso = from;
    const toIso = to;
    const fromInclusive = new Date(fromIso);
    const toExclusive = new Date(toIso);

    this.logger.log(
      `ops metrics query=${JSON.stringify({
        taskType,
        from: fromIso,
        to: toIso,
        requestId: req.requestId,
      })}`,
    );

    if (taskType === 'export') {
      const [rawStatusCounts, errorCodeCounts] = await Promise.all([
        this.repo.aggregateExportStatusCounts({ fromInclusive, toExclusive }),
        this.repo.aggregateExportErrorCodes({ fromInclusive, toExclusive }),
      ]);
      return finalizeOpsMetricsResponse({
        taskType: taskType as OpsMetricsTaskType,
        window: { from: fromIso, to: toIso },
        rawStatusCounts,
        errorCodeCounts,
      });
    }
    const [rawStatusCounts, errorCodeCounts] = await Promise.all([
      this.repo.aggregatePolishStatusCounts({ fromInclusive, toExclusive }),
      this.repo.aggregatePolishErrorCodes({ fromInclusive, toExclusive }),
    ]);
    return finalizeOpsMetricsResponse({
      taskType: taskType as OpsMetricsTaskType,
      window: { from: fromIso, to: toIso },
      rawStatusCounts,
      errorCodeCounts,
    });
  }
}
