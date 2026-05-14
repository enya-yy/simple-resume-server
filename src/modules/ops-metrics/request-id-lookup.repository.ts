import { Inject, Injectable } from '@nestjs/common';
import type { PgLikePool, QueryResult } from '@simple-resume/sqlite-pg';
import { APP_DB } from '../../database/app-db.token';

export interface JobDiagnosticRow {
  job_id: string;
  job_type: 'export' | 'polish';
  status: string;
  error_code: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

@Injectable()
export class RequestIdLookupRepository {
  constructor(@Inject(APP_DB) private readonly pool: PgLikePool) {}

  async findJobsByRequestId(requestId: string): Promise<JobDiagnosticRow[]> {
    const result: QueryResult<JobDiagnosticRow> = await this.pool.query(
      `SELECT id AS job_id, 'export' AS job_type, status, error_code, created_at, updated_at, completed_at
         FROM export_jobs
        WHERE request_id = $1
       UNION ALL
       SELECT id AS job_id, 'polish' AS job_type, status, error_code, created_at, updated_at, completed_at
         FROM polish_jobs
        WHERE request_id = $1
       ORDER BY created_at ASC`,
      [requestId],
    );
    return result.rows;
  }
}
