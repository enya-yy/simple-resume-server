import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { JobStatus } from '../../contracts/index';
import type { PgLikePool, QueryResult } from '@simple-resume/sqlite-pg';
import { APP_DB } from '../../database/app-db.token';

export interface ImportJobRow {
  id: string;
  user_id: string;
  resume_id: string;
  session_id: string;
  status: JobStatus;
  source_kind: 'file' | 'paste';
  source_mime: string | null;
  source_object_key: string | null;
  source_text: string | null;
  extracted_text: string | null;
  error_code: string | null;
  error_message: string | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class ImportJobsRepository {
  constructor(@Inject(APP_DB) private readonly pool: PgLikePool) {}

  async countRecentForUser(userId: string, withinHours: number): Promise<number> {
    const cutoff = new Date(
      Date.now() - withinHours * 60 * 60 * 1000,
    ).toISOString();
    const result = await this.pool.query<{ count: number | string }>(
      `SELECT COUNT(*) AS count
         FROM import_jobs
        WHERE user_id = $1
          AND created_at >= $2`,
      [userId, cutoff],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async insertQueued(params: {
    id?: string;
    userId: string;
    resumeId: string;
    sessionId: string;
    sourceKind: 'file' | 'paste';
    sourceMime?: string | null;
    sourceObjectKey?: string | null;
    sourceText?: string | null;
    requestId?: string;
  }): Promise<{ id: string }> {
    const id = params.id ?? randomUUID();
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO import_jobs (
         id, user_id, resume_id, session_id, status,
         source_kind, source_mime, source_object_key, source_text, request_id
       )
       VALUES ($1, $2, $3, $4, 'queued', $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        id,
        params.userId,
        params.resumeId,
        params.sessionId,
        params.sourceKind,
        params.sourceMime ?? null,
        params.sourceObjectKey ?? null,
        params.sourceText ?? null,
        params.requestId ?? null,
      ],
    );
    const out = result.rows[0]?.id;
    if (!out) {
      throw new Error('import_jobs insert failed');
    }
    return { id: out };
  }

  async countActiveOrSucceededForSession(sessionId: string): Promise<number> {
    const result = await this.pool.query<{ count: number | string }>(
      `SELECT COUNT(*) AS count
         FROM import_jobs
        WHERE session_id = $1
          AND status IN ('queued', 'running', 'succeeded')`,
      [sessionId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async findById(jobId: string): Promise<ImportJobRow | undefined> {
    const result: QueryResult<ImportJobRow> = await this.pool.query(
      `SELECT id, user_id, resume_id, session_id, status,
              source_kind, source_mime, source_object_key, source_text,
              extracted_text, error_code, error_message,
              completed_at, created_at, updated_at
         FROM import_jobs
        WHERE id = $1
        LIMIT 1`,
      [jobId],
    );
    return result.rows[0];
  }

  async deleteStaleFiles(beforeIso: string): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM import_jobs
        WHERE source_object_key IS NOT NULL
          AND created_at < $1
          AND status IN ('succeeded', 'failed')`,
      [beforeIso],
    );
    return result.rowCount ?? 0;
  }
}
