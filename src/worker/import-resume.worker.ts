import {
  IMPORT_JOB_ERROR_CODES,
  buildImportSuccessChatMessages,
  deriveResumeTitleFromBasics,
} from '../contracts/index';
import type { PgLikePool } from '@simple-resume/sqlite-pg';
import { randomUUID } from 'node:crypto';
import { parseEnv } from '../config/env.schema';
import { OpenAiChatRequestError } from '../common/llm/openai-chat-completion';
import { extractResumeText } from './import/extractResumeText';
import { runImportLlmPipeline } from '../common/llm/import/import-llm';
import { JobTimeoutError } from './lib/job-timeout';

const MSG_FAILED =
  '简历导入失败，请稍后重试。若问题持续，请联系支持并附上 requestId。';
const MSG_PARSE =
  '无法解析该文件，请确认格式为 PDF、Word(.docx) 或图片，或尝试粘贴纯文本。';

function getImportJobTimeoutMs(): number {
  return parseEnv(process.env).IMPORT_LLM_TIMEOUT_MS;
}

async function markImportFailed(
  pool: PgLikePool,
  jobId: string,
  code: string,
  message: string,
): Promise<void> {
  await pool.query(
    `UPDATE import_jobs
        SET status = 'failed',
            error_code = $2,
            error_message = $3,
            completed_at = now(),
            updated_at = now()
      WHERE id = $1 AND status = 'running'`,
    [jobId, code, message],
  );
}

async function runImportJobInner(
  pool: PgLikePool,
  importJobId: string,
  signal?: AbortSignal,
): Promise<void> {
  const startedAt = Date.now();
  const r1 = await pool.query(
    `UPDATE import_jobs SET status = 'running', updated_at = now()
     WHERE id = $1 AND status = 'queued'`,
    [importJobId],
  );
  if (r1.rowCount === 0) {
    console.warn(
      '[worker] import job skipped (not queued or already claimed)',
      importJobId,
    );
    return;
  }

  const jobRow = await pool.query<{
    user_id: string;
    resume_id: string;
    session_id: string;
    source_kind: 'file' | 'paste';
    source_mime: string | null;
    source_object_key: string | null;
    source_text: string | null;
  }>(
    `SELECT user_id, resume_id, session_id, source_kind,
            source_mime, source_object_key, source_text
       FROM import_jobs
      WHERE id = $1 AND status = 'running'`,
    [importJobId],
  );
  const row = jobRow.rows[0];
  if (!row) {
    await markImportFailed(
      pool,
      importJobId,
      IMPORT_JOB_ERROR_CODES.IMPORT_JOB_FAILED,
      MSG_FAILED,
    );
    return;
  }

  let extractedText = '';
  let imageBuffers: Buffer[] = [];
  const imageMime = row.source_mime ?? 'image/png';

  try {
    const extracted = await extractResumeText({
      sourceKind: row.source_kind,
      sourceMime: row.source_mime,
      sourceObjectKey: row.source_object_key,
      sourceText: row.source_text,
    });
    extractedText = extracted.text;
    imageBuffers = extracted.imageBuffers;
    console.info('[worker] import text extracted', {
      jobId: importJobId,
      sourceKind: row.source_kind,
      mime: row.source_mime,
      textLength: extractedText.length,
      imagePages: imageBuffers.length,
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[worker] import text extraction failed', importJobId, detail);
    await markImportFailed(
      pool,
      importJobId,
      IMPORT_JOB_ERROR_CODES.IMPORT_PARSE_FAILED,
      MSG_PARSE,
    );
    return;
  }

  if (
    !extractedText.trim() &&
    imageBuffers.length === 0 &&
    row.source_kind === 'paste'
  ) {
    await markImportFailed(
      pool,
      importJobId,
      IMPORT_JOB_ERROR_CODES.IMPORT_EMPTY_CONTENT,
      '粘贴内容为空，请重新输入。',
    );
    return;
  }

  let document;
  try {
    document = await runImportLlmPipeline({
      extractedText,
      imageBuffers,
      imageMime,
      signal,
    });
    console.info('[worker] import LLM succeeded', {
      jobId: importJobId,
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    if (signal?.aborted) {
      throw new JobTimeoutError(importJobId);
    }
    const message =
      err instanceof OpenAiChatRequestError
        ? err.userHint
        : err instanceof Error && err.name === 'ZodError'
          ? '简历解析结果格式无效，请稍后重试或换一份文件。'
          : MSG_FAILED;
    const code =
      err instanceof OpenAiChatRequestError &&
      err.message === 'import_empty_text'
        ? IMPORT_JOB_ERROR_CODES.IMPORT_EMPTY_CONTENT
        : IMPORT_JOB_ERROR_CODES.IMPORT_LLM_FAILED;
    console.error('[worker] import LLM failed', importJobId, err);
    await markImportFailed(pool, importJobId, code, message);
    return;
  }

  const storeExtracted =
    process.env.IMPORT_DEBUG_STORE_EXTRACTED_TEXT === 'true';
  const finalText =
    extractedText ||
    (imageBuffers.length > 0 ? '[vision-ocr]' : '');

  const derivedTitle = deriveResumeTitleFromBasics(document.basics);

  await pool.transaction(async (client) => {
    await client.query(
      `UPDATE resumes
          SET document_json = $3::jsonb,
              title = CASE WHEN title_locked = 0 THEN $4 ELSE title END,
              updated_at = now()
        WHERE id = $1 AND user_id = $2`,
      [
        row.resume_id,
        row.user_id,
        JSON.stringify(document),
        derivedTitle || '未命名简历',
      ],
    );

    const importChatMessages = buildImportSuccessChatMessages(document);
    for (const msg of importChatMessages) {
      await client.query(
        `INSERT INTO chat_messages (id, session_id, role, content_type, content_json, intent)
         VALUES ($1, $2, 'assistant', $3, $4, NULL)`,
        [
          randomUUID(),
          row.session_id,
          msg.contentType,
          JSON.stringify(msg.contentJson),
        ],
      );
    }

    await client.query(
      `UPDATE import_jobs SET
          status = 'succeeded',
          extracted_text = $2,
          completed_at = now(),
          updated_at = now()
        WHERE id = $1 AND status = 'running'`,
      [
        importJobId,
        storeExtracted ? finalText.slice(0, 20_000) : null,
      ],
    );
  });

  console.info('[worker] import job succeeded', {
    jobId: importJobId,
    ms: Date.now() - startedAt,
  });
}

export async function runImportJobStep(
  pool: PgLikePool,
  importJobId: string,
): Promise<void> {
  const timeoutMs = getImportJobTimeoutMs();
  const abortCtrl = new AbortController();
  const timer = setTimeout(() => abortCtrl.abort(), timeoutMs);

  try {
    await runImportJobInner(pool, importJobId, abortCtrl.signal);
  } catch (err) {
    if (err instanceof JobTimeoutError || abortCtrl.signal.aborted) {
      await markImportFailed(
        pool,
        importJobId,
        IMPORT_JOB_ERROR_CODES.IMPORT_JOB_FAILED,
        '简历导入超时，请稍后重试或换一份较小的文件。',
      );
      return;
    }
    const internalDetail =
      err instanceof Error ? err.stack ?? err.message : String(err);
    console.error('[worker] import job failed', importJobId, internalDetail);
    try {
      await pool.query(
        `UPDATE import_jobs
              SET status = 'failed',
                  error_code = $2,
                  error_message = $3,
                  completed_at = now(),
                  updated_at = now()
            WHERE id = $1 AND status IN ('queued', 'running')`,
        [importJobId, IMPORT_JOB_ERROR_CODES.IMPORT_JOB_FAILED, MSG_FAILED],
      );
    } catch (dbErr) {
      console.error(
        '[worker] failed to persist import_jobs failed state',
        importJobId,
        dbErr instanceof Error ? dbErr.message : String(dbErr),
      );
    }
  } finally {
    clearTimeout(timer);
  }
}
