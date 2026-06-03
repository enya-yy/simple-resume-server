import { randomUUID } from 'node:crypto';
import type { PgLikePool } from '@simple-resume/sqlite-pg';
import type { LlmUsageSnapshot, LlmUsageSource } from '../../contracts/llm/llm-token-usage';

export type WorkerLlmTokenUsageInsert = {
  userId: string;
  source: LlmUsageSource;
  model?: string | null;
  usage: LlmUsageSnapshot;
  requestId?: string | null;
  refId?: string | null;
};

/** Worker 进程内直接写入，失败仅打日志不抛错。 */
export async function recordLlmTokenUsage(
  pool: PgLikePool,
  row: WorkerLlmTokenUsageInsert,
): Promise<void> {
  if (row.usage.totalTokens <= 0 && row.usage.promptTokens <= 0) {
    return;
  }
  try {
    await pool.query(
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
  } catch (err) {
    console.warn(
      '[llm-token-usage] record failed',
      row.userId,
      row.source,
      err instanceof Error ? err.message : String(err),
    );
  }
}
