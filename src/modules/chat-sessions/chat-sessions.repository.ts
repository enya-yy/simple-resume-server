import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { PgLikePool } from '@simple-resume/sqlite-pg';
import { APP_DB } from '../../database/app-db.token';

export interface ChatSessionRow {
  id: string;
  resume_id: string;
  user_id: string;
  title: string;
  updated_at: Date;
  last_message_summary: string;
  resume_imported: boolean | number;
}

@Injectable()
export class ChatSessionsRepository {
  constructor(@Inject(APP_DB) private readonly pool: PgLikePool) {}

  async listByUser(userId: string): Promise<ChatSessionRow[]> {
    const result = await this.pool.query<ChatSessionRow>(
      `SELECT cs.id, cs.resume_id, cs.user_id, cs.title, cs.updated_at,
              '' AS last_message_summary,
              EXISTS (
                SELECT 1
                  FROM import_jobs ij
                 WHERE ij.session_id = cs.id
                   AND ij.status IN ('queued', 'running', 'succeeded')
              ) AS resume_imported
       FROM chat_sessions cs
       WHERE cs.user_id = $1 AND cs.deleted_at IS NULL
       ORDER BY cs.updated_at DESC`,
      [userId],
    );
    return result.rows;
  }

  async findActiveByResume(
    resumeId: string,
    userId: string,
  ): Promise<ChatSessionRow | null> {
    const result = await this.pool.query<ChatSessionRow>(
      `SELECT id, resume_id, user_id, title, updated_at,
              '' AS last_message_summary,
              0 AS resume_imported
       FROM chat_sessions
       WHERE resume_id = $1 AND user_id = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [resumeId, userId],
    );
    return result.rows[0] ?? null;
  }

  async createForResume(
    userId: string,
    resumeId: string,
    title: string,
  ): Promise<ChatSessionRow | null> {
    const id = randomUUID();
    const result = await this.pool.query<ChatSessionRow>(
      `INSERT INTO chat_sessions (id, resume_id, user_id, title)
       SELECT $1, r.id, $2, $3
       FROM resumes r
       WHERE r.id = $4 AND r.user_id = $2
       RETURNING id, resume_id, user_id, title, updated_at,
                 '' AS last_message_summary,
                 0 AS resume_imported`,
      [id, userId, title, resumeId],
    );
    return result.rows[0] ?? null;
  }

  async patchTitle(
    sessionId: string,
    userId: string,
    title: string,
  ): Promise<
    | { ok: true; session: ChatSessionRow }
    | { ok: false; error: 'NOT_FOUND' | 'FORBIDDEN' }
  > {
    const existing = await this.pool.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM chat_sessions
       WHERE id = $1 AND deleted_at IS NULL`,
      [sessionId],
    );
    if (!existing.rows[0]) {
      return { ok: false, error: 'NOT_FOUND' };
    }
    if (existing.rows[0].user_id !== userId) {
      return { ok: false, error: 'FORBIDDEN' };
    }

    const result = await this.pool.query<ChatSessionRow>(
      `UPDATE chat_sessions
       SET title = $1, updated_at = now()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING id, resume_id, user_id, title, updated_at,
                 '' AS last_message_summary,
                 0 AS resume_imported`,
      [title, sessionId],
    );
    if (!result.rows[0]) {
      return { ok: false, error: 'NOT_FOUND' };
    }
    return { ok: true, session: result.rows[0] };
  }

  async findById(sessionId: string): Promise<ChatSessionRow | null> {
    const result = await this.pool.query<ChatSessionRow>(
      `SELECT id, resume_id, user_id, title, updated_at,
              '' AS last_message_summary,
              0 AS resume_imported
       FROM chat_sessions
       WHERE id = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [sessionId],
    );
    return result.rows[0] ?? null;
  }

  async hasResumeImport(sessionId: string): Promise<boolean> {
    const result = await this.pool.query<{ resume_imported: boolean | number }>(
      `SELECT EXISTS (
         SELECT 1
           FROM import_jobs ij
          WHERE ij.session_id = $1
            AND ij.status IN ('queued', 'running', 'succeeded')
       ) AS resume_imported`,
      [sessionId],
    );
    return Boolean(result.rows[0]?.resume_imported);
  }

  async softDelete(
    sessionId: string,
    userId: string,
  ): Promise<{ ok: true } | { ok: false; error: 'NOT_FOUND' | 'FORBIDDEN' }> {
    const existing = await this.pool.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM chat_sessions
       WHERE id = $1 AND deleted_at IS NULL`,
      [sessionId],
    );
    if (!existing.rows[0]) {
      return { ok: false, error: 'NOT_FOUND' };
    }
    if (existing.rows[0].user_id !== userId) {
      return { ok: false, error: 'FORBIDDEN' };
    }

    await this.pool.query(
      `UPDATE chat_sessions SET deleted_at = now() WHERE id = $1`,
      [sessionId],
    );
    return { ok: true };
  }
}
