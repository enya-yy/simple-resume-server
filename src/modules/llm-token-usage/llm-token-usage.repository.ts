import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { PgLikePool } from '@simple-resume/sqlite-pg';
import type { LlmUsageSnapshot, LlmUsageSource } from '../../contracts/llm/llm-token-usage';
import { APP_DB } from '../../database/app-db.token';

export type LlmTokenUsageInsert = {
  userId: string;
  source: LlmUsageSource;
  model?: string | null;
  usage: LlmUsageSnapshot;
  requestId?: string | null;
  refId?: string | null;
};

export type LlmUsageTimeRange = {
  from: string | null;
  to: string | null;
};

function buildTimeFilters(
  range: LlmUsageTimeRange,
  column: string,
  startIndex: number,
): { sql: string; params: string[] } {
  const parts: string[] = [];
  const params: string[] = [];
  let idx = startIndex;
  if (range.from) {
    parts.push(`${column} >= $${idx}`);
    params.push(range.from);
    idx += 1;
  }
  if (range.to) {
    parts.push(`${column} <= $${idx}`);
    params.push(range.to);
    idx += 1;
  }
  return {
    sql: parts.length > 0 ? parts.join(' AND ') : '',
    params,
  };
}

@Injectable()
export class LlmTokenUsageRepository {
  constructor(@Inject(APP_DB) private readonly pool: PgLikePool) {}

  async insert(row: LlmTokenUsageInsert): Promise<void> {
    await this.pool.query(
      `INSERT INTO llm_token_usage (
         id, user_id, source, model,
         prompt_tokens, completion_tokens, total_tokens,
         request_id, ref_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        randomUUID(),
        row.userId,
        row.source,
        row.model ?? null,
        row.usage.promptTokens,
        row.usage.completionTokens,
        row.usage.totalTokens,
        row.requestId ?? null,
        row.refId ?? null,
      ],
    );
  }

  async getPlatformSummary(range: LlmUsageTimeRange) {
    const time = buildTimeFilters(range, 'created_at', 1);
    const where = time.sql ? `WHERE ${time.sql}` : '';

    const totals = await this.pool.query<{
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      call_count: number;
    }>(
      `SELECT
         COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
         COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
         COALESCE(SUM(total_tokens), 0) AS total_tokens,
         COUNT(*) AS call_count
       FROM llm_token_usage
       ${where}`,
      time.params,
    );

    const bySource = await this.pool.query<{
      source: string;
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      call_count: number;
    }>(
      `SELECT
         source,
         COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
         COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
         COALESCE(SUM(total_tokens), 0) AS total_tokens,
         COUNT(*) AS call_count
       FROM llm_token_usage
       ${where}
       GROUP BY source
       ORDER BY total_tokens DESC`,
      time.params,
    );

    const row = totals.rows[0];
    return {
      promptTokens: Number(row?.prompt_tokens ?? 0),
      completionTokens: Number(row?.completion_tokens ?? 0),
      totalTokens: Number(row?.total_tokens ?? 0),
      callCount: Number(row?.call_count ?? 0),
      bySource: bySource.rows.map((s) => ({
        source: s.source,
        promptTokens: Number(s.prompt_tokens),
        completionTokens: Number(s.completion_tokens),
        totalTokens: Number(s.total_tokens),
        callCount: Number(s.call_count),
      })),
    };
  }

  async listUsersUsage(params: {
    q?: string;
    limit: number;
    offset: number;
    range: LlmUsageTimeRange;
  }) {
    const time = buildTimeFilters(params.range, 'u.created_at', 1);
    const whereParts: string[] = [];
    const queryParams: (string | number)[] = [...time.params];

    if (time.sql) whereParts.push(time.sql);

    const q = params.q?.trim().toLowerCase();
    if (q) {
      whereParts.push(`LOWER(users.email) LIKE $${queryParams.length + 1}`);
      queryParams.push(`%${q}%`);
    }

    const where =
      whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    const countRes = await this.pool.query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM (
         SELECT u.user_id
           FROM llm_token_usage u
           INNER JOIN users ON users.id = u.user_id
          ${where}
          GROUP BY u.user_id
       )`,
      queryParams,
    );

    const limitIdx = queryParams.length + 1;
    const offsetIdx = queryParams.length + 2;
    const listRes = await this.pool.query<{
      user_id: string;
      email: string;
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      call_count: number;
      last_used_at: string | null;
    }>(
      `SELECT
         u.user_id,
         users.email,
         COALESCE(SUM(u.prompt_tokens), 0) AS prompt_tokens,
         COALESCE(SUM(u.completion_tokens), 0) AS completion_tokens,
         COALESCE(SUM(u.total_tokens), 0) AS total_tokens,
         COUNT(*) AS call_count,
         MAX(u.created_at) AS last_used_at
       FROM llm_token_usage u
       INNER JOIN users ON users.id = u.user_id
      ${where}
      GROUP BY u.user_id, users.email
      ORDER BY total_tokens DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...queryParams, params.limit, params.offset],
    );

    return {
      total: Number(countRes.rows[0]?.total ?? 0),
      items: listRes.rows.map((r) => ({
        userId: r.user_id,
        email: r.email,
        promptTokens: Number(r.prompt_tokens),
        completionTokens: Number(r.completion_tokens),
        totalTokens: Number(r.total_tokens),
        callCount: Number(r.call_count),
        lastUsedAt: r.last_used_at,
      })),
    };
  }

  async getUserStats(userId: string, range: LlmUsageTimeRange) {
    const time = buildTimeFilters(range, 'created_at', 2);
    const andTime = time.sql ? `AND ${time.sql}` : '';

    const r = await this.pool.query<{
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      call_count: number;
      last_used_at: string | null;
    }>(
      `SELECT
         COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
         COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
         COALESCE(SUM(total_tokens), 0) AS total_tokens,
         COUNT(*) AS call_count,
         MAX(created_at) AS last_used_at
       FROM llm_token_usage
       WHERE user_id = $1 ${andTime}`,
      [userId, ...time.params],
    );

    const row = r.rows[0];
    return {
      promptTokens: Number(row?.prompt_tokens ?? 0),
      completionTokens: Number(row?.completion_tokens ?? 0),
      totalTokens: Number(row?.total_tokens ?? 0),
      callCount: Number(row?.call_count ?? 0),
      lastUsedAt: row?.last_used_at ?? null,
    };
  }
}
