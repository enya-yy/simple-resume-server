import {
  CHAT_ASSIST_JOB_ERROR_CODES,
  CHAT_ASSIST_JOB_TIMEOUT_MS_DEFAULT,
  CHAT_ASSIST_POLISH_FIELD,
  resolveChatAssistLlmEnv,
  type ChatAssistKind,
  type ChatAssistPolishField,
} from "./contracts/index.js";
import { ruleBasedPolish } from "./polish.worker.js";
import type { PgLikePool } from "@simple-resume/sqlite-pg";

import { JobTimeoutError, withTimeout } from "./lib/job-timeout.js";
import {
  OpenAiChatRequestError,
  completeOpenAiChatCompletion,
} from "./bailian-dashscope-chat.js";

const MSG_PROCESSING =
  "对话辅助处理失败，请稍后重试。若问题持续，请联系支持并附上 requestId。";
const MSG_TIMEOUT =
  "对话辅助超时，请稍后重试。若问题持续，请联系支持并附上 requestId。";
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

const POLISH_FIELD_LABEL: Record<ChatAssistPolishField, string> = {
  summary: "个人简介",
  description: "工作/项目描述",
};

function buildSystemPrompt(assistKind: ChatAssistKind): string {
  if (assistKind === "polish") {
    return [
      "你是中文简历润色助手。用户会提供字段类型与待润色原文。",
      "在保留事实、数据与专有名词的前提下，优化措辞、结构与专业度；",
      "不要编造新事实；不要添加原文没有的公司、项目或成果。",
      "仅输出润色后的正文，不要加标题、引号或解释说明。",
      "若原文含 Markdown 列表或分段，可保留并适度优化格式。",
    ].join("");
  }
  if (assistKind === "basics") {
    return [
      "你是中文简历写作助手。根据用户给出的字段定位与可选短上下文，",
      "给出一条简洁、可操作的表达建议（纯文本，不超过 400 字）。",
      "不要编造具体公司名、项目名或日期；不要输出 JSON。",
    ].join("");
  }
  return [
    "你是中文简历写作助手。根据用户给出的经历/项目场景提示，",
    "给出一条简洁、可操作的表达或结构建议（纯文本，不超过 400 字）。",
    "不要编造具体事实；不要输出 JSON。",
  ].join("");
}

function buildUserPayload(params: {
  assistKind: ChatAssistKind;
  targetHint: string | null;
  contextHint: string | null;
}): string {
  if (params.assistKind === "polish") {
    const fieldKey = params.targetHint as ChatAssistPolishField | null;
    const fieldLabel =
      fieldKey && CHAT_ASSIST_POLISH_FIELD.includes(fieldKey)
        ? POLISH_FIELD_LABEL[fieldKey]
        : "简历正文";
    const parts = [`字段类型：${fieldLabel}`, "待润色原文：", params.contextHint ?? ""];
    parts.push("请直接输出润色后的正文。");
    return parts.join("\n");
  }
  const parts: string[] = [`辅助类型：${params.assistKind}`];
  if (params.targetHint) {
    parts.push(`定位/字段：${params.targetHint}`);
  }
  if (params.contextHint) {
    parts.push(`用户补充（短）：${params.contextHint}`);
  }
  parts.push("请直接给出建议正文。");
  return parts.join("\n");
}

function placeholderSuggestion(
  assistKind: ChatAssistKind,
  sourceText: string | null,
): string {
  if (assistKind === "polish" && sourceText) {
    return ruleBasedPolish(sourceText);
  }
  return [
    "【离线占位】未配置可用的对话模型密钥。请设置 DEEPSEEK_API_KEY 并指定 LLM_PROVIDER=deepseek",
    "（推荐，默认模型 deepseek-v4-flash），或沿用百炼：DASHSCOPE_API_KEY 与 LLM_PROVIDER=dashscope。",
    `当前为本地/CI 占位输出（类型：${assistKind}）。`,
    "配置密钥后，将调用兼容 OpenAI Chat Completions 的接口生成真实建议。",
    "写作提示：用动词开头、量化结果、避免空泛形容词。",
  ].join("");
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
      "[worker] chat-assist job skipped (not queued or already claimed)",
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
  if (
    assistKind !== "basics" &&
    assistKind !== "experience" &&
    assistKind !== "polish"
  ) {
    await markChatAssistFailed(
      pool,
      chatAssistJobId,
      CHAT_ASSIST_JOB_ERROR_CODES.CHAT_ASSIST_PROCESSING_FAILED,
      MSG_PROCESSING,
    );
    return;
  }

  if (assistKind === "polish") {
    const fieldKey = row.target_hint as ChatAssistPolishField | null;
    if (!fieldKey || !CHAT_ASSIST_POLISH_FIELD.includes(fieldKey)) {
      await markChatAssistFailed(
        pool,
        chatAssistJobId,
        CHAT_ASSIST_JOB_ERROR_CODES.CHAT_ASSIST_PROCESSING_FAILED,
        MSG_PROCESSING,
      );
      return;
    }
    const source = row.context_hint?.trim() ?? "";
    if (!source) {
      await markChatAssistFailed(
        pool,
        chatAssistJobId,
        CHAT_ASSIST_JOB_ERROR_CODES.CHAT_ASSIST_PROCESSING_FAILED,
        "润色内容为空，请先填写正文。",
      );
      return;
    }
  }

  const userContent = buildUserPayload({
    assistKind,
    targetHint: row.target_hint,
    contextHint: row.context_hint,
  });

  let suggestion: string;
  try {
    const cfg = resolveChatAssistLlmEnv(process.env);
    if (!cfg) {
      suggestion = placeholderSuggestion(assistKind, row.context_hint);
    } else {
      suggestion = await completeOpenAiChatCompletion({
        backend: cfg.backend,
        apiKey: cfg.apiKey,
        model: cfg.model,
        baseUrl: cfg.baseUrl,
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
      e instanceof OpenAiChatRequestError ? e.userHint : MSG_PROCESSING;
    const logBits =
      e instanceof OpenAiChatRequestError
        ? [e.httpStatus, e.apiCode ?? ""].join(" ")
        : "";
    console.error(
      "[worker] chat-assist processing failed",
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
    console.error("[worker] chat-assist job failed", chatAssistJobId, errorCode);
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
        "[worker] failed to persist chat_assist_jobs failed state",
        chatAssistJobId,
        dbErr instanceof Error ? dbErr.message : String(dbErr),
      );
    }
  }
}
