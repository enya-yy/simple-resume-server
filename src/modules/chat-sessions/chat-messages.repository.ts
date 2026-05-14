import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { PgLikePool } from '@simple-resume/sqlite-pg';
import { APP_DB } from '../../database/app-db.token';

export interface ChatMessageDbRow {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content_type: 'text' | 'form_card' | 'layout_command';
  content_json: Record<string, unknown>;
  intent: string | null;
  created_at: Date;
}

@Injectable()
export class ChatMessagesRepository {
  constructor(@Inject(APP_DB) private readonly pool: PgLikePool) {}

  async insertMessage(params: {
    sessionId: string;
    role: 'user' | 'assistant' | 'system';
    contentType: 'text' | 'form_card' | 'layout_command';
    contentJson: Record<string, unknown>;
    intent?: string | null;
  }): Promise<ChatMessageDbRow> {
    const id = randomUUID();
    const result = await this.pool.query<ChatMessageDbRow>(
      `INSERT INTO chat_messages (id, session_id, role, content_type, content_json, intent)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, session_id, role, content_type, content_json, intent, created_at`,
      [
        id,
        params.sessionId,
        params.role,
        params.contentType,
        JSON.stringify(params.contentJson),
        params.intent ?? null,
      ],
    );
    return result.rows[0]!;
  }

  async findBySessionAndId(
    sessionId: string,
    messageId: string,
  ): Promise<ChatMessageDbRow | null> {
    const result = await this.pool.query<ChatMessageDbRow>(
      `SELECT id, session_id, role, content_type, content_json, intent, created_at
       FROM chat_messages
       WHERE session_id = $1 AND id = $2`,
      [sessionId, messageId],
    );
    return result.rows[0] ?? null;
  }

  async updateContentJson(
    sessionId: string,
    messageId: string,
    contentJson: Record<string, unknown>,
  ): Promise<ChatMessageDbRow | null> {
    const result = await this.pool.query<ChatMessageDbRow>(
      `UPDATE chat_messages
       SET content_json = $1::jsonb
       WHERE session_id = $2 AND id = $3
       RETURNING id, session_id, role, content_type, content_json, intent, created_at`,
      [JSON.stringify(contentJson), sessionId, messageId],
    );
    return result.rows[0] ?? null;
  }

  async listBySession(
    sessionId: string,
    limit = 50,
    before?: string,
  ): Promise<ChatMessageDbRow[]> {
    if (before) {
      const result = await this.pool.query<ChatMessageDbRow>(
        `SELECT id, session_id, role, content_type, content_json, intent, created_at
         FROM chat_messages
         WHERE session_id = $1 AND created_at < (SELECT created_at FROM chat_messages WHERE id = $2)
         ORDER BY created_at ASC
         LIMIT $3`,
        [sessionId, before, limit],
      );
      return result.rows;
    }

    const result = await this.pool.query<ChatMessageDbRow>(
      `SELECT id, session_id, role, content_type, content_json, intent, created_at
       FROM chat_messages
       WHERE session_id = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [sessionId, limit],
    );
    return result.rows;
  }
}
