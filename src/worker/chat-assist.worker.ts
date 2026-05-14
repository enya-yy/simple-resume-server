import {
  CHAT_ASSIST_JOB_ERROR_CODES,
  CHAT_ASSIST_JOB_TIMEOUT_MS_DEFAULT,
  type ChatAssistKind,
} from '../contracts/index';
import type { PgLikePool } from '@simple-resume/sqlite-pg';

import { JobTimeoutError, withTimeout } from './lib/job-timeout.js';
import {
  DashScopeRequestError,
  completeDashScopeChat,
  getDashScopeEnv,
} from './bailian-dashscope-chat.js';

const MSG_PROCESSING =
  '对话辅助处理失败，请稍后重试。若问题持续，请联系支持并附上 requestId。';
const MSG_TIMEOUT =
  '对话辅助超时，请稍后重试。若问题持续，请联系支持并附上 requestId。';
const SUGGESTION_TEXT_MAX_LENGTH = 8000;

function getChatAssistJobTimeoutMs(): number {
  const envVal =
    process.env.CHAT_ASSIST_JOB_TIMEOUT_MS ?? process.env.POLISH_JOB_TIMEOUT_MS;
  if (envVal) {
    const parsed = Number(envVal);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return CHAT_ASSIST_JOB_TIMEOUT_MS_DEFAULT;
}

function buildSystemPrompt(assistKind: ChatAssistKind): string {
  if (assistKind === 'basics') {
    return [
      '你是中文简历写作助手。根据用户给出的字段定位与可选短上下文，',
      '给出一条简洁、可操作的表达建议（纯文本，不超过 400 字）。',
      '不要编造具体公司名、项目名或日期；不要输出 JSON。',
    ].join('');
  }
  return [
    '你是中文简历写作助手。根据用户给出的经历/项目场景提示，',
    '给出一条简洁、可操作的表达或结构建议（纯文本，不超过 400 字）。',
    '不要编造具体事实；不要输出 JSON。',
  ].join('');
}

function buildUserPayload(params: {
  assistKind: ChatAssistKind;
  targetHint: string | null;
  contextHint: string | null;
}): string {
  const parts: string[] = [`辅助类型：${params.assistKind}`];
  if (params.targetHint) {
    parts.push(`定位/字段：${params.targetHint}`);
  }
  if (params.contextHint) {
    parts.push(`用户补充（短）：${params.contextHint}`);
  }
  parts.push('请直接给出建议正文。');
  return parts.join('\n');
}

function placeholderSuggestion(assistKind: ChatAssistKind): string {
  return [
    '【离线占位】尚未配置 DASHSCOPE_API_KEY（阿里云百炼 API-KEY），',
    `当前为本地/CI 占位输出（类型：${assistKind}）。`,
    '配置密钥后，将调用百炼兼容 OpenAI 的 Chat Completions 生成真实建议。',
    '写作提示：用动词开头、量化结果、避免空泛形容词。',
  ].join('');
}

async function markChatAssistFailed(
  pool: PgLikePool,
  jobId: string,
  code: string,
  message: string,
): Promise<void> {
  await pool.query(
    `UPDATE chat_assist_jobs
        SET status = 'failed',
            error_code = $2,
            error_message = $3,
            updated_at = now()
      WHERE id = $1 AND status = 'running'`,
    [jobId, code, message],
  );
}

async function runChatAssistJobInner(
  pool: PgLikePool,
  chatAssistJobId: string,
): Promise<void> {
  const r1 = await pool.query(
    `UPDATE chat_assist_jobs SET status = 'running', updated_at = now()
     WHERE id = $1 AND status = 'queued'`,
    [chatAssistJobId],
  );
  if (r1.rowCount === 0) {
    console.warn(
      '[worker] chat-assist job skipped (not queued or already claimed)',
      chatAssistJobId,
    );
    return;
  }

  const jobRow = await pool.query<{
    assist_kind: string;
    target_hint: string | null;
    context_hint: string | null;
  }>(
    `SELECT assist_kind, target_hint, context_hint
       FROM chat_assist_jobs
      WHERE id = $1 AND status = 'running'`,
    [chatAssistJobId],
  );
  const row = jobRow.rows[0];
  if (!row) {
    await markChatAssistFailed(
      pool,
      chatAssistJobId,
      CHAT_ASSIST_JOB_ERROR_CODES.CHAT_ASSIST_JOB_FAILED,
      MSG_PROCESSING,
    );
    return;
  }

  const assistKind = row.assist_kind as ChatAssistKind;
  if (assistKind !== 'basics' && assistKind !== 'experience') {
    await markChatAssistFailed(
      pool,
      chatAssistJobId,
      CHAT_ASSIST_JOB_ERROR_CODES.CHAT_ASSIST_PROCESSING_FAILED,
      MSG_PROCESSING,
    );
    return;
  }

  const userContent = buildUserPayload({
    assistKind,
    targetHint: row.target_hint,
    contextHint: row.context_hint,
  });

  let suggestion: string;
  try {
    const ds = getDashScopeEnv();
    if (!ds.apiKey) {
      suggestion = placeholderSuggestion(assistKind);
    } else {
      suggestion = await completeDashScopeChat({
        apiKey: ds.apiKey,
        model: ds.model,
        baseUrl: ds.baseUrl,
        systemPrompt: buildSystemPrompt(assistKind),
        userContent,
      });
    }

    const trimmedSuggestion =
      suggestion.length > SUGGESTION_TEXT_MAX_LENGTH
        ? suggestion.slice(0, SUGGESTION_TEXT_MAX_LENGTH)
        : suggestion;

    await pool.query(
      `UPDATE chat_assist_jobs SET
          status = 'succeeded',
          suggestion_text = $2,
          completed_at = now(),
          updated_at = now()
        WHERE id = $1 AND status = 'running'`,
      [chatAssistJobId, trimmedSuggestion],
    );
  } catch (e) {
    const userMsg =
      e instanceof DashScopeRequestError ? e.userHint : MSG_PROCESSING;
    const logBits =
      e instanceof DashScopeRequestError
        ? [e.httpStatus, e.apiCode ?? ''].join(' ')
        : '';
    console.error(
      '[worker] chat-assist processing failed',
      chatAssistJobId,
      logBits,
    );
    await markChatAssistFailed(
      pool,
      chatAssistJobId,
      CHAT_ASSIST_JOB_ERROR_CODES.CHAT_ASSIST_PROCESSING_FAILED,
      userMsg,
    );
  }
}

export async function runChatAssistJobStep(
  pool: PgLikePool,
  chatAssistJobId: string,
): Promise<void> {
  try {
    await withTimeout(
      runChatAssistJobInner(pool, chatAssistJobId),
      getChatAssistJobTimeoutMs(),
      chatAssistJobId,
    );
  } catch (e) {
    const isTimeout = e instanceof JobTimeoutError;
    const errorCode = isTimeout
      ? CHAT_ASSIST_JOB_ERROR_CODES.CHAT_ASSIST_JOB_TIMED_OUT
      : CHAT_ASSIST_JOB_ERROR_CODES.CHAT_ASSIST_PROCESSING_FAILED;
    const userSafeMessage = isTimeout ? MSG_TIMEOUT : MSG_PROCESSING;
    console.error(
      '[worker] chat-assist job failed',
      chatAssistJobId,
      errorCode,
    );
    try {
      await pool.query(
        `UPDATE chat_assist_jobs
              SET status = 'failed',
                  error_code = $2,
                  error_message = $3,
                  updated_at = now()
            WHERE id = $1 AND status IN ('queued', 'running')`,
        [chatAssistJobId, errorCode, userSafeMessage],
      );
    } catch (dbErr) {
      console.error(
        '[worker] failed to persist chat_assist_jobs failed state',
        chatAssistJobId,
        dbErr instanceof Error ? dbErr.message : String(dbErr),
      );
    }
  }
}
