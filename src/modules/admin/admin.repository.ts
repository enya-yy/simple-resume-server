import { Inject, Injectable } from '@nestjs/common';
import type { PgLikePool } from '@simple-resume/sqlite-pg';
import { APP_DB } from '../../database/app-db.token';

export interface AdminUserStatsRow {
  resume_count: number;
  chat_session_count: number;
  last_activity_at: string | null;
}

@Injectable()
export class AdminRepository {
  constructor(@Inject(APP_DB) private readonly pool: PgLikePool) {}

  async getUserStats(userId: string): Promise<AdminUserStatsRow> {
    const r = await this.pool.query<AdminUserStatsRow>(
      `SELECT
         (SELECT COUNT(*) FROM resumes WHERE user_id = $1) AS resume_count,
         (SELECT COUNT(*) FROM chat_sessions WHERE user_id = $1) AS chat_session_count,
         (
           SELECT MAX(ts) FROM (
             SELECT updated_at AS ts FROM resumes WHERE user_id = $1
             UNION ALL
             SELECT updated_at FROM chat_sessions WHERE user_id = $1
             UNION ALL
             SELECT updated_at FROM export_jobs WHERE user_id = $1
             UNION ALL
             SELECT updated_at FROM import_jobs WHERE user_id = $1
             UNION ALL
             SELECT updated_at FROM polish_jobs WHERE user_id = $1
             UNION ALL
             SELECT updated_at FROM chat_assist_jobs WHERE user_id = $1
           )
         ) AS last_activity_at`,
      [userId],
    );
    const row = r.rows[0];
    return {
      resume_count: Number(row?.resume_count ?? 0),
      chat_session_count: Number(row?.chat_session_count ?? 0),
      last_activity_at: row?.last_activity_at ?? null,
    };
  }
}
