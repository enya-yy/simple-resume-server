import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { JobStatus } from '../../contracts/index';
import type { PgLikePool, QueryResult } from '@simple-resume/sqlite-pg';
import { APP_DB } from '../../database/app-db.token';

export interface ExportJobRow {
  id: string;
  user_id: string;
  resume_id: string;
  status: JobStatus;
  error_code: string | null;
  error_message: string | null;
  artifact_object_key: string | null;
  artifact_content_type: string | null;
  artifact_size_bytes: number | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class ExportJobsRepository {
  constructor(@Inject(APP_DB) private readonly pool: PgLikePool) {}

  async insertQueued(params: {
    userId: string;
    resumeId: string;
    status: JobStatus;
    requestId?: string;
  }): Promise<{ id: string }> {
    const id = randomUUID();
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO export_jobs (id, user_id, resume_id, status, request_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        id,
        params.userId,
        params.resumeId,
        params.status,
        params.requestId ?? null,
      ],
    );
    const out = result.rows[0]?.id;
    if (!out) {
      throw new Error('export_jobs insert failed');
    }
    return { id: out };
  }

  async findById(jobId: string): Promise<ExportJobRow | undefined> {
    const result: QueryResult<ExportJobRow> = await this.pool.query(
      `SELECT id, user_id, resume_id, status,
              error_code, error_message,
              artifact_object_key, artifact_content_type, artifact_size_bytes,
              completed_at, created_at, updated_at
         FROM export_jobs
        WHERE id = $1
        LIMIT 1`,
      [jobId],
    );
    return result.rows[0];
  }
}
