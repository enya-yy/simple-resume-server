/**
 * OpenAI 兼容 Chat Completions（百炼 DashScope、DeepSeek 等；服务端/Worker 专用）。
 */
import type { ChatAssistLlmBackend } from "./contracts/index.js";

/** 可带上用户可读说明，供写入 chat_assist_jobs.error_message */
export class OpenAiChatRequestError extends Error {
  constructor(
    message: string,
    readonly userHint: string,
    readonly httpStatus: number,
    readonly apiCode?: string,
  ) {
    super(message);
    this.name = "OpenAiChatRequestError";
  }
}

type OpenAiStyleError = { error?: { code?: string; message?: string; type?: string } };
type ProviderTopError = { code?: string; message?: string };

type ChatCompletionJson = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

function extractTextFromMessage(message: { content?: unknown } | undefined): string {
  if (!message) return "";
  const c = message.content;
  if (typeof c === "string") return c.trim();
  if (Array.isArray(c)) {
    const parts: string[] = [];
    for (const item of c) {
      if (typeof item === "string") parts.push(item);
      else if (item && typeof item === "object" && "text" in item) {
        parts.push(String((item as { text?: string }).text ?? ""));
      }
    }
    return parts.join("").trim();
  }
  return "";
}

function parseOpenAiStyleError(rawText: string): { code?: string; message?: string } {
  try {
    const j = JSON.parse(rawText) as OpenAiStyleError & ProviderTopError;
    if (j.error?.message || j.error?.code) {
      return { code: j.error.code ?? j.error.type, message: j.error.message };
    }
    if (j.message || j.code) {
      return { code: j.code, message: j.message };
    }
  } catch {
    /* ignore */
  }
  return {};
}

function userHintForChatFailure(
  backend: ChatAssistLlmBackend,
  status: number,
  apiCode?: string,
  apiMessage?: string,
): string {
  const code = apiCode ?? "";
  const msg = (apiMessage ?? "").toLowerCase();

  if (status === 401 || code === "InvalidApiKey" || /invalid.*api.*key/i.test(msg)) {
    if (backend === "deepseek") {
      return [
        "DeepSeek API Key 无效或未生效。",
        "请在 https://platform.deepseek.com/api_keys 创建密钥，并写入环境变量 DEEPSEEK_API_KEY。",
      ].join("");
    }
    return [
      "百炼 API Key 无效或未生效。",
      "请在阿里云大模型服务平台百炼控制台创建 API-KEY，并写入 Worker 环境变量 DASHSCOPE_API_KEY。",
    ].join("");
  }
  if (status === 403) {
    if (backend === "deepseek") {
      return "DeepSeek 拒绝访问：请确认 API Key 有效且账号未欠费。";
    }
    return "百炼拒绝访问：请确认 API Key 有对应模型调用权限，且账号未欠费。";
  }
  if (
    status === 400 ||
    code === "InvalidParameter" ||
    /model|invalid/i.test(code) ||
    /model/i.test(msg)
  ) {
    if (backend === "deepseek") {
      return [
        "DeepSeek 请求参数或模型名不正确。",
        "请检查环境变量 DEEPSEEK_MODEL（如 deepseek-v4-flash、deepseek-v4-pro），与控制台一致。",
        "若问题持续，请联系支持并附上 requestId。",
      ].join("");
    }
    return [
      "百炼请求参数或模型名不正确。",
      "请检查环境变量 DASHSCOPE_MODEL（如 qwen-turbo、qwen-plus），与控制台已开通的模型一致。",
      "若问题持续，请联系支持并附上 requestId。",
    ].join("");
  }
  if (status === 404) {
    if (backend === "deepseek") {
      return [
        "DeepSeek 接口路径不存在。请确认 DEEPSEEK_BASE_URL 为：https://api.deepseek.com",
      ].join("");
    }
    return [
      "百炼接口路径不存在。请确认 DASHSCOPE_BASE_URL 为兼容模式地址：",
      "https://dashscope.aliyuncs.com/compatible-mode/v1（新加坡等国际域请见百炼文档）。",
    ].join("");
  }
  if (status === 429) {
    return "模型服务限流，请稍后重试。若问题持续，请联系支持并附上 requestId。";
  }
  if (status >= 500) {
    return "对话辅助服务暂时不可用，请稍后重试。若问题持续，请联系支持并附上 requestId。";
  }
  return "对话辅助处理失败，请稍后重试。若问题持续，请联系支持并附上 requestId。";
}

const unknownJsonHint =
  "模型服务返回内容无法解析，请稍后重试。若问题持续，请联系支持并附上 requestId。";
const emptyChoiceHint =
  "模型未返回有效文本，请稍后重试或检查模型配置。若问题持续，请联系支持并附上 requestId。";

export async function completeOpenAiChatCompletion(params: {
  backend: ChatAssistLlmBackend;
  apiKey: string;
  model: string;
  baseUrl: string;
  systemPrompt: string;
  userContent: string;
  signal?: AbortSignal;
}): Promise<string> {
  const base = params.baseUrl.replace(/\/$/, "");
  const url = `${base}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userContent },
      ],
      stream: false,
    }),
    signal: params.signal,
  });

  const rawText = await res.text();
  if (!res.ok) {
    const { code: apiCode, message: apiMessage } = parseOpenAiStyleError(rawText);
    const hint = userHintForChatFailure(
      params.backend,
      res.status,
      apiCode,
      apiMessage,
    );
    throw new OpenAiChatRequestError(
      `llm_http_${res.status}`,
      hint,
      res.status,
      apiCode,
    );
  }

  let json: ChatCompletionJson;
  try {
    json = JSON.parse(rawText) as ChatCompletionJson;
  } catch {
    throw new OpenAiChatRequestError("llm_invalid_json", unknownJsonHint, res.status);
  }

  const content = extractTextFromMessage(json.choices?.[0]?.message);
  if (!content) {
    throw new OpenAiChatRequestError("llm_empty_choice", emptyChoiceHint, res.status);
  }
  return content;
}
