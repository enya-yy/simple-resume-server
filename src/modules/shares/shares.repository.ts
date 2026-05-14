import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { PgLikePool, QueryResult } from '@simple-resume/sqlite-pg';
import { APP_DB } from '../../database/app-db.token';

interface ShareRow {
  id: string;
  user_id: string;
  resume_id: string;
  token_hash: string;
  password_hash: string | null;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface ShareReadRow {
  share_id: string;
  user_id: string;
  resume_id: string;
  created_at: Date;
  document_json: unknown;
  template_id: string;
  layout_options: unknown;
}

interface ShareMetaRow {
  share_id: string;
  password_hash: string | null;
  expires_at: Date | null;
}

@Injectable()
export class SharesRepository {
  constructor(@Inject(APP_DB) private readonly pool: PgLikePool) {}

  async insert(params: {
    userId: string;
    resumeId: string;
    tokenHash: string;
    passwordHash?: string;
    expiresAt?: Date;
  }): Promise<{ id: string; createdAt: Date; expiresAt: Date | null }> {
    const id = randomUUID();
    const result: QueryResult<ShareRow> = await this.pool.query(
      `INSERT INTO shares (id, user_id, resume_id, token_hash, password_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, resume_id, token_hash, password_hash, expires_at, created_at, updated_at`,
      [
        id,
        params.userId,
        params.resumeId,
        params.tokenHash,
        params.passwordHash ?? null,
        params.expiresAt?.toISOString() ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('shares insert failed');
    }
    return { id: row.id, createdAt: row.created_at, expiresAt: row.expires_at };
  }

  async findMetaByTokenHash(
    tokenHash: string,
  ): Promise<ShareMetaRow | undefined> {
    const result: QueryResult<ShareMetaRow> = await this.pool.query(
      `SELECT id AS share_id, password_hash, expires_at FROM shares WHERE token_hash = $1 LIMIT 1`,
      [tokenHash],
    );
    return result.rows[0];
  }

  async findReadOnlyByTokenHash(
    tokenHash: string,
  ): Promise<ShareReadRow | undefined> {
    const result: QueryResult<ShareReadRow> = await this.pool.query(
      `SELECT s.id AS share_id, s.user_id, s.resume_id, s.created_at,
              r.document_json,
              json_extract(r.document_json, '$.templateId') AS template_id,
              json_extract(r.document_json, '$.layoutOptions') AS layout_options
         FROM shares s
         JOIN resumes r ON r.id = s.resume_id
        WHERE s.token_hash = $1
        LIMIT 1`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    let layout_options: unknown = row.layout_options;
    if (typeof layout_options === 'string') {
      try {
        layout_options = JSON.parse(layout_options) as unknown;
      } catch {
        /* keep string */
      }
    }
    return { ...row, layout_options };
  }
}
