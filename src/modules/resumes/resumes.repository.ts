import { randomUUID } from 'node:crypto';
import {
  deriveResumeTitleFromBasics,
  EMPTY_RESUME_DOCUMENT,
  resumeDocumentSchema,
  type ResumeDocument,
} from '../../contracts/index';
import { Inject, Injectable } from '@nestjs/common';
import type { PgLikePool } from '@simple-resume/sqlite-pg';
import { ZodError } from 'zod';
import { APP_DB } from '../../database/app-db.token';

export interface CreatedResumeRow {
  resume_id: string;
  document_json: unknown;
  session_id?: string;
}

export interface ResumeListRow {
  resume_id: string;
  title: string;
  updated_at: Date;
}

export interface ResumeRowForOwner {
  id: string;
  user_id: string;
  title: string;
  title_locked: number;
  document_json: unknown;
  schema_version: number;
  updated_at: Date;
}

export interface ResumeTitleMetaRow {
  title: string;
  title_locked: number;
}

@Injectable()
export class ResumesRepository {
  constructor(@Inject(APP_DB) private readonly pool: PgLikePool) {}

  async listResumesForOwner(userId: string): Promise<ResumeListRow[]> {
    const result = await this.pool.query<ResumeListRow>(
      `SELECT id AS resume_id, title, updated_at
       FROM resumes
       WHERE user_id = $1
       ORDER BY updated_at DESC, created_at DESC`,
      [userId],
    );
    return result.rows;
  }

  async createResumeWithDefaultDocument(
    userId: string,
  ): Promise<CreatedResumeRow> {
    const documentJson = structuredClone(EMPTY_RESUME_DOCUMENT);
    const resumeId = randomUUID();
    const sessionId = randomUUID();
    await this.pool.transaction(async (client) => {
      await client.query(
        `INSERT INTO resumes (id, user_id, title, title_locked, document_json, schema_version)
         VALUES ($1, $2, $3, 0, $4::jsonb, $5)
         RETURNING id`,
        [resumeId, userId, '未命名简历', JSON.stringify(documentJson), 1],
      );
      await client.query(
        `INSERT INTO chat_sessions (id, resume_id, user_id, title)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [sessionId, resumeId, userId, '未命名简历'],
      );
    });
    return {
      resume_id: resumeId,
      document_json: documentJson,
      session_id: sessionId,
    };
  }

  async findByIdForOwner(
    resumeId: string,
    userId: string,
  ): Promise<ResumeRowForOwner | undefined> {
    const result = await this.pool.query<ResumeRowForOwner>(
      `SELECT id, user_id, title, title_locked, document_json, schema_version, updated_at
       FROM resumes
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [resumeId, userId],
    );
    return result.rows[0];
  }

  async updateDocumentForOwner(
    resumeId: string,
    userId: string,
    documentJson: unknown,
  ): Promise<ResumeRowForOwner | undefined> {
    const result = await this.pool.query<ResumeRowForOwner>(
      `UPDATE resumes
          SET document_json = $3::jsonb,
              updated_at = now()
        WHERE id = $1 AND user_id = $2
      RETURNING id, user_id, title, title_locked, document_json, schema_version, updated_at`,
      [resumeId, userId, JSON.stringify(documentJson)],
    );
    return result.rows[0];
  }

  async findTitleMetaForOwner(
    resumeId: string,
    userId: string,
  ): Promise<ResumeTitleMetaRow | undefined> {
    const result = await this.pool.query<ResumeTitleMetaRow>(
      `SELECT title, title_locked
       FROM resumes
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [resumeId, userId],
    );
    return result.rows[0];
  }

  async syncActiveSessionTitleForResume(
    resumeId: string,
    userId: string,
    title: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE chat_sessions
          SET title = $3, updated_at = now()
        WHERE resume_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [resumeId, userId, title],
    );
  }

  async setTitleForOwner(
    resumeId: string,
    userId: string,
    title: string,
    lock: boolean,
  ): Promise<ResumeRowForOwner | undefined> {
    const lockedVal = lock ? 1 : 0;
    const result = await this.pool.query<ResumeRowForOwner>(
      `UPDATE resumes
          SET title = $3,
              title_locked = $4,
              updated_at = now()
        WHERE id = $1 AND user_id = $2
      RETURNING id, user_id, title, title_locked, document_json, schema_version, updated_at`,
      [resumeId, userId, title, lockedVal],
    );
    const row = result.rows[0];
    if (row) {
      await this.syncActiveSessionTitleForResume(resumeId, userId, title);
    }
    return row;
  }

  /** 未锁定时根据 basics 自动更新库内展示名，并同步活跃会话标题 */
  async applyAutoTitleFromBasicsIfUnlocked(
    resumeId: string,
    userId: string,
    document: ResumeDocument,
  ): Promise<void> {
    const meta = await this.findTitleMetaForOwner(resumeId, userId);
    if (!meta || meta.title_locked) return;

    const next = deriveResumeTitleFromBasics(document.basics);
    if (!next || next === meta.title) return;

    await this.setTitleForOwner(resumeId, userId, next, false);
  }

  /**
   * 复制来源简历为新行（新 resume_id + 新 chat_session），正文为来源当前已持久化 document。
   */
  async duplicateResumeForOwner(
    userId: string,
    sourceResumeId: string,
  ): Promise<
    | {
        ok: true;
        data: {
          resumeId: string;
          sessionId: string;
          documentJson: unknown;
          schemaVersion: number;
        };
      }
    | { ok: false; error: 'RESUME_NOT_FOUND' | 'DOCUMENT_INVALID' }
  > {
    return this.pool.transaction(async (client) => {
      const src = await client.query<{
        id: string;
        title: string;
        document_json: unknown;
        schema_version: number;
      }>(
        `SELECT id, title, document_json, schema_version
         FROM resumes WHERE id = $1 AND user_id = $2`,
        [sourceResumeId, userId],
      );
      const source = src.rows[0];
      if (!source) {
        return { ok: false, error: 'RESUME_NOT_FOUND' };
      }

      let docParsed;
      try {
        docParsed = resumeDocumentSchema.parse(
          JSON.parse(JSON.stringify(source.document_json)) as unknown,
        );
      } catch (e) {
        if (e instanceof ZodError) {
          return { ok: false, error: 'DOCUMENT_INVALID' };
        }
        throw e;
      }

      const dupTitleBase = `副本 · ${source.title}`;
      const dupTitle =
        dupTitleBase.length > 255 ? dupTitleBase.slice(0, 255) : dupTitleBase;

      const newResumeId = randomUUID();
      const newSessionId = randomUUID();

      const ins = await client.query<{
        id: string;
        document_json: unknown;
        schema_version: number;
      }>(
        `INSERT INTO resumes (id, user_id, title, title_locked, document_json, schema_version)
         VALUES ($1, $2, $3, 1, $4::jsonb, $5)
         RETURNING id, document_json, schema_version`,
        [
          newResumeId,
          userId,
          dupTitle,
          JSON.stringify(docParsed),
          source.schema_version,
        ],
      );
      const newRow = ins.rows[0];
      if (!newRow) {
        throw new Error('resumes insert duplicate returned no row');
      }

      await client.query(
        `INSERT INTO chat_sessions (id, resume_id, user_id, title)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [newSessionId, newRow.id, userId, dupTitle],
      );

      return {
        ok: true,
        data: {
          resumeId: newRow.id,
          sessionId: newSessionId,
          documentJson: newRow.document_json,
          schemaVersion: newRow.schema_version,
        },
      };
    });
  }

  async deleteByIdForUser(resumeId: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM resumes WHERE id = $1 AND user_id = $2`,
      [resumeId, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
