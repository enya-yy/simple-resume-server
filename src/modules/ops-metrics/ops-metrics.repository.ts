import { Inject, Injectable } from '@nestjs/common';
import type { JobStatus } from '../../contracts/index';
import { OPS_AGGREGATE_NO_ERROR_CODE } from '../../contracts/index';
import type { PgLikePool, QueryResult } from '@simple-resume/sqlite-pg';
import { APP_DB } from '../../database/app-db.token';

export interface StatusCountRow {
  status: JobStatus;
  count: number;
}

export interface ErrorCodeCountRow {
  errorCode: string;
  count: number;
}

@Injectable()
export class OpsMetricsRepository {
  constructor(@Inject(APP_DB) private readonly pool: PgLikePool) {}

  async aggregateExportStatusCounts(params: {
    fromInclusive: Date;
    toExclusive: Date;
  }): Promise<Partial<Record<JobStatus, number>>> {
    const result: QueryResult<{ status: JobStatus; count: number }> =
      await this.pool.query(
        `SELECT status, COUNT(*) AS count
           FROM export_jobs
          WHERE created_at >= $1 AND created_at < $2
          GROUP BY status`,
        [params.fromInclusive.toISOString(), params.toExclusive.toISOString()],
      );
    const out: Partial<Record<JobStatus, number>> = {};
    for (const row of result.rows) {
      out[row.status] = Number(row.count);
    }
    return out;
  }

  async aggregatePolishStatusCounts(params: {
    fromInclusive: Date;
    toExclusive: Date;
  }): Promise<Partial<Record<JobStatus, number>>> {
    const result: QueryResult<{ status: JobStatus; count: number }> =
      await this.pool.query(
        `SELECT status, COUNT(*) AS count
           FROM polish_jobs
          WHERE created_at >= $1 AND created_at < $2
          GROUP BY status`,
        [params.fromInclusive.toISOString(), params.toExclusive.toISOString()],
      );
    const out: Partial<Record<JobStatus, number>> = {};
    for (const row of result.rows) {
      out[row.status] = Number(row.count);
    }
    return out;
  }

  async aggregateExportErrorCodes(params: {
    fromInclusive: Date;
    toExclusive: Date;
  }): Promise<ErrorCodeCountRow[]> {
    const result: QueryResult<{ error_code: string; count: number }> =
      await this.pool.query(
        `SELECT COALESCE(error_code, $3) AS error_code, COUNT(*) AS count
           FROM export_jobs
          WHERE created_at >= $1 AND created_at < $2
            AND status IN ('failed', 'cancelled')
          GROUP BY COALESCE(error_code, $3)
          ORDER BY count DESC`,
        [
          params.fromInclusive.toISOString(),
          params.toExclusive.toISOString(),
          OPS_AGGREGATE_NO_ERROR_CODE,
        ],
      );
    return result.rows.map((r) => ({
      errorCode: r.error_code,
      count: Number(r.count),
    }));
  }

  async aggregatePolishErrorCodes(params: {
    fromInclusive: Date;
    toExclusive: Date;
  }): Promise<ErrorCodeCountRow[]> {
    const result: QueryResult<{ error_code: string; count: number }> =
      await this.pool.query(
        `SELECT COALESCE(error_code, $3) AS error_code, COUNT(*) AS count
           FROM polish_jobs
          WHERE created_at >= $1 AND created_at < $2
            AND status IN ('failed', 'cancelled')
          GROUP BY COALESCE(error_code, $3)
          ORDER BY count DESC`,
        [
          params.fromInclusive.toISOString(),
          params.toExclusive.toISOString(),
          OPS_AGGREGATE_NO_ERROR_CODE,
        ],
      );
    return result.rows.map((r) => ({
      errorCode: r.error_code,
      count: Number(r.count),
    }));
  }
}
