import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { JobStatus } from '../../contracts/index';
import type { PgLikePool, QueryResult } from '@simple-resume/sqlite-pg';
import { APP_DB } from '../../database/app-db.token';

export type ChatAssistJobRow = {
  id: string;
  user_id: string;
  resume_id: string;
  status: JobStatus;
  assist_kind: string;
  target_hint: string | null;
  context_hint: string | null;
  suggestion_text: string | null;
  error_code: string | null;
  error_message: string | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class ChatAssistJobsRepository {
  constructor(@Inject(APP_DB) private readonly pool: PgLikePool) {}

  async insertQueued(params: {
    userId: string;
    resumeId: string;
    status: JobStatus;
    assistKind: string;
    targetHint?: string;
    contextHint?: string;
  }): Promise<{ id: string }> {
    const id = randomUUID();
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO chat_assist_jobs (
         id, user_id, resume_id, status,
         assist_kind, target_hint, context_hint
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        id,
        params.userId,
        params.resumeId,
        params.status,
        params.assistKind,
        params.targetHint ?? null,
        params.contextHint ?? null,
      ],
    );
    const out = result.rows[0]?.id;
    if (!out) {
      throw new Error('chat_assist_jobs insert failed');
    }
    return { id: out };
  }

  async deleteQueuedById(jobId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM chat_assist_jobs WHERE id = $1 AND status = 'queued'`,
      [jobId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findById(jobId: string): Promise<ChatAssistJobRow | undefined> {
    const result: QueryResult<ChatAssistJobRow> = await this.pool.query(
      `SELECT id, user_id, resume_id, status,
              assist_kind, target_hint, context_hint, suggestion_text,
              error_code, error_message,
              completed_at, created_at, updated_at
         FROM chat_assist_jobs
        WHERE id = $1
        LIMIT 1`,
      [jobId],
    );
    return result.rows[0];
  }
}
