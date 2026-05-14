import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { JobStatus } from '../../contracts/index';
import type { PgLikePool, QueryResult } from '@simple-resume/sqlite-pg';
import { APP_DB } from '../../database/app-db.token';

export interface PolishJobRow {
  id: string;
  user_id: string;
  resume_id: string;
  status: JobStatus;
  module_id: string;
  item_id: string;
  bullet_index: number | null;
  original_text: string | null;
  polished_text: string | null;
  error_code: string | null;
  error_message: string | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class PolishJobsRepository {
  constructor(@Inject(APP_DB) private readonly pool: PgLikePool) {}

  async insertQueued(params: {
    userId: string;
    resumeId: string;
    status: JobStatus;
    moduleId: string;
    itemId: string;
    bulletIndex?: number;
    requestId?: string;
  }): Promise<{ id: string }> {
    const id = randomUUID();
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO polish_jobs (id, user_id, resume_id, status, module_id, item_id, bullet_index, request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        id,
        params.userId,
        params.resumeId,
        params.status,
        params.moduleId,
        params.itemId,
        params.bulletIndex ?? null,
        params.requestId ?? null,
      ],
    );
    const out = result.rows[0]?.id;
    if (!out) {
      throw new Error('polish_jobs insert failed');
    }
    return { id: out };
  }

  async deleteQueuedById(jobId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM polish_jobs WHERE id = $1 AND status = 'queued'`,
      [jobId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findById(jobId: string): Promise<PolishJobRow | undefined> {
    const result: QueryResult<PolishJobRow> = await this.pool.query(
      `SELECT id, user_id, resume_id, status,
              module_id, item_id, bullet_index,
              original_text, polished_text,
              error_code, error_message,
              completed_at, created_at, updated_at
         FROM polish_jobs
        WHERE id = $1
        LIMIT 1`,
      [jobId],
    );
    return result.rows[0];
  }
}
