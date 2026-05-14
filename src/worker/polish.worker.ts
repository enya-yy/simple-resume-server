import {
  POLISH_JOB_ERROR_CODES,
  POLISH_JOB_TIMEOUT_MS_DEFAULT,
  extractPolishTargetText,
  resumeDocumentSchema,
} from '../contracts/index';
import type { ResumeDocument } from '../contracts/index';
import type { PgLikePool } from '@simple-resume/sqlite-pg';
import { ZodError } from 'zod';

import { JobTimeoutError, withTimeout } from './lib/job-timeout.js';

const MSG_EXTRACTION =
  '无法提取目标条目文本，请检查条目是否仍然存在。若问题持续，请联系支持并附上 requestId。';
const MSG_PROCESSING =
  '润色处理失败，请稍后重试。若问题持续，请联系支持并附上 requestId。';
const MSG_TIMEOUT =
  '润色超时，请稍后重试。若问题持续，请联系支持并附上 requestId。';
const MSG_UPSTREAM =
  '润色服务暂时不可用，请稍后重试。若问题持续，请联系支持并附上 requestId。';

function getPolishJobTimeoutMs(): number {
  const envVal = process.env.POLISH_JOB_TIMEOUT_MS;
  if (envVal) {
    const parsed = Number(envVal);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return POLISH_JOB_TIMEOUT_MS_DEFAULT;
}

async function markPolishFailed(
  pool: PgLikePool,
  polishJobId: string,
  code: string,
  message: string,
): Promise<void> {
  await pool.query(
    `UPDATE polish_jobs
        SET status = 'failed',
            error_code = $2,
            error_message = $3,
            updated_at = now()
      WHERE id = $1 AND status = 'running'`,
    [polishJobId, code, message],
  );
}

/**
 * MVP 规则型润色：去多余空格、统一中文标点、删首尾空白。
 * 后续 Story 可在此接口处接入 LLM provider。
 */
export function ruleBasedPolish(text: string): string {
  let result = text.trim();
  result = result.replace(/[ \t]{2,}/g, ' ');
  result = result.replace(/,\s*/g, '，');
  result = result.replace(/\.\s*$/gm, '。');
  result = result.replace(/;\s*/g, '；');
  result = result.replace(/:\s*/g, '：');
  result = result
    .split('\n')
    .map((line) => line.trim())
    .join('\n');
  return result;
}

async function runPolishJobInner(
  pool: PgLikePool,
  polishJobId: string,
): Promise<void> {
  const r1 = await pool.query(
    `UPDATE polish_jobs SET status = 'running', updated_at = now()
     WHERE id = $1 AND status = 'queued'`,
    [polishJobId],
  );
  if (r1.rowCount === 0) {
    console.warn(
      '[worker] polish job skipped (not queued or already claimed)',
      polishJobId,
    );
    return;
  }

  const jobRow = await pool.query<{
    module_id: string;
    item_id: string;
    bullet_index: number | null;
    resume_id: string;
    document_json: unknown;
  }>(
    `SELECT pj.module_id, pj.item_id, pj.bullet_index, pj.resume_id, r.document_json
       FROM polish_jobs pj
       INNER JOIN resumes r ON r.id = pj.resume_id
      WHERE pj.id = $1 AND pj.status = 'running'`,
    [polishJobId],
  );
  const row = jobRow.rows[0];
  if (!row) {
    await markPolishFailed(
      pool,
      polishJobId,
      POLISH_JOB_ERROR_CODES.POLISH_JOB_FAILED,
      MSG_PROCESSING,
    );
    return;
  }

  let doc: ResumeDocument;
  try {
    doc = resumeDocumentSchema.parse(row.document_json) as ResumeDocument;
  } catch (e) {
    if (e instanceof ZodError) {
      console.error('[worker] document_json invalid', polishJobId);
    }
    await markPolishFailed(
      pool,
      polishJobId,
      POLISH_JOB_ERROR_CODES.POLISH_TEXT_EXTRACTION_FAILED,
      MSG_EXTRACTION,
    );
    return;
  }

  const originalText = extractPolishTargetText(doc, {
    moduleId: row.module_id,
    itemId: row.item_id,
    bulletIndex: row.bullet_index ?? undefined,
  });
  if (!originalText) {
    await markPolishFailed(
      pool,
      polishJobId,
      POLISH_JOB_ERROR_CODES.POLISH_TEXT_EXTRACTION_FAILED,
      MSG_EXTRACTION,
    );
    return;
  }

  try {
    const polishedText = ruleBasedPolish(originalText);

    await pool.query(
      `UPDATE polish_jobs SET
          status = 'succeeded',
          original_text = $2,
          polished_text = $3,
          completed_at = now(),
          updated_at = now()
        WHERE id = $1 AND status = 'running'`,
      [polishJobId, originalText, polishedText],
    );
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[worker] polish processing failed', polishJobId, detail);
    await markPolishFailed(
      pool,
      polishJobId,
      POLISH_JOB_ERROR_CODES.POLISH_PROCESSING_FAILED,
      MSG_PROCESSING,
    );
  }
}

export async function runPolishJobStep(
  pool: PgLikePool,
  polishJobId: string,
): Promise<void> {
  try {
    await withTimeout(
      runPolishJobInner(pool, polishJobId),
      getPolishJobTimeoutMs(),
      polishJobId,
    );
  } catch (e) {
    const isTimeout = e instanceof JobTimeoutError;
    const errorCode = isTimeout
      ? POLISH_JOB_ERROR_CODES.POLISH_JOB_TIMED_OUT
      : POLISH_JOB_ERROR_CODES.POLISH_UPSTREAM_UNAVAILABLE;
    const userSafeMessage = isTimeout ? MSG_TIMEOUT : MSG_UPSTREAM;
    console.error('[worker] polish job failed', polishJobId, errorCode);
    try {
      await pool.query(
        `UPDATE polish_jobs
              SET status = 'failed',
                  error_code = $2,
                  error_message = $3,
                  updated_at = now()
            WHERE id = $1 AND status IN ('queued', 'running')`,
        [polishJobId, errorCode, userSafeMessage],
      );
    } catch (dbErr) {
      console.error(
        '[worker] failed to persist polish_jobs failed state',
        polishJobId,
        dbErr instanceof Error ? dbErr.message : String(dbErr),
      );
    }
  }
}
