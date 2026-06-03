import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ResumeDocument } from '../../../contracts/index';
import {
  LLM_USAGE_SOURCES,
  type LlmUsageSnapshot,
} from '../../../contracts/llm/llm-token-usage';
import {
  resolveChatAssistLlmEnv,
  type ChatAssistLlmBackend,
  type ChatAssistLlmResolved,
} from '../../../contracts/llm/chat-assist-llm-env';
import { resolveDashScopeEnv } from '../../../contracts/llm/dashscope-config';
import { resolveDeepSeekEnv } from '../../../contracts/llm/deepseek-config';
import {
  buildResumeImportSystemPrompt,
  buildResumeImportUserPrompt,
  buildResumeOcrSystemPrompt,
} from '../prompts/resume-import.prompt';
import {
  normalizeImportedDocument,
  parseJsonFromLlmResponse,
} from './normalize-import-document';
import {
  OpenAiChatRequestError,
  completeOpenAiChatCompletion,
  completeOpenAiVisionChatCompletion,
} from '../openai-chat-completion';
import { PDF_TEXT_MIN_CHARS } from './import-constants';

export interface ImportLlmResolved extends ChatAssistLlmResolved {
  visionModel: string;
}

export type ImportVisionCreds = {
  backend: ChatAssistLlmBackend;
  apiKey: string;
  model: string;
  baseUrl: string;
};

export function resolveImportLlmEnv(
  env: Record<string, string | undefined>,
): ImportLlmResolved | null {
  const base = resolveChatAssistLlmEnv(env);
  if (!base) return null;

  if (base.backend === 'dashscope') {
    const vision = resolveDashScopeEnv(env, {
      modelKey: 'DASHSCOPE_VISION_MODEL',
      fallbackModel: 'qwen-vl-max',
    });
    return { ...base, visionModel: vision.model };
  }

  const vision = resolveDeepSeekEnv(env, {
    modelKey: 'DEEPSEEK_VISION_MODEL',
    fallbackModel: base.model,
  });
  return { ...base, visionModel: vision.model };
}

/** OCR 优先用百炼视觉模型（即使用 deepseek 做结构化解析）。 */
export function resolveImportVisionCreds(
  env: Record<string, string | undefined>,
): ImportVisionCreds | null {
  const dashVision = resolveDashScopeEnv(env, {
    modelKey: 'DASHSCOPE_VISION_MODEL',
    fallbackModel: 'qwen-vl-max',
  });
  if (dashVision.apiKey) {
    return {
      backend: 'dashscope',
      apiKey: dashVision.apiKey,
      model: dashVision.model,
      baseUrl: dashVision.baseUrl,
    };
  }

  const llm = resolveImportLlmEnv(env);
  if (!llm) return null;

  return {
    backend: llm.backend,
    apiKey: llm.apiKey,
    model: llm.visionModel,
    baseUrl: llm.baseUrl,
  };
}

function loadStubImportDocument(): ResumeDocument {
  const demoPath = join(
    process.cwd(),
    'schemas',
    'demo',
    'resume-document.backend.json',
  );
  const raw = JSON.parse(readFileSync(demoPath, 'utf8')) as unknown;
  return normalizeImportedDocument(raw);
}

function mimeToDataUrl(mime: string, buffer: Buffer): string {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

export type ImportLlmUsageRecord = {
  source: typeof LLM_USAGE_SOURCES.IMPORT_OCR | typeof LLM_USAGE_SOURCES.IMPORT_PARSE;
  model: string;
  usage: LlmUsageSnapshot;
};

export async function ocrImagesToText(params: {
  vision: ImportVisionCreds;
  imageBuffers: Buffer[];
  mime: string;
  signal?: AbortSignal;
  usageRecords?: ImportLlmUsageRecord[];
}): Promise<string> {
  if (params.imageBuffers.length === 0) return '';

  const parts: string[] = [];
  for (let i = 0; i < params.imageBuffers.length; i++) {
    const result = await completeOpenAiVisionChatCompletion({
      backend: params.vision.backend,
      apiKey: params.vision.apiKey,
      model: params.vision.model,
      baseUrl: params.vision.baseUrl,
      systemPrompt: buildResumeOcrSystemPrompt(),
      imageDataUrl: mimeToDataUrl(params.mime, params.imageBuffers[i]!),
      userText:
        params.imageBuffers.length > 1
          ? `这是简历第 ${i + 1}/${params.imageBuffers.length} 页，请提取全部文字。`
          : '请提取这份简历图片中的全部文字。',
      signal: params.signal,
    });
    params.usageRecords?.push({
      source: LLM_USAGE_SOURCES.IMPORT_OCR,
      model: params.vision.model,
      usage: result.usage,
    });
    parts.push(result.content);
  }
  return parts.join('\n\n').trim();
}

export async function parseResumeFromText(params: {
  llm: ImportLlmResolved;
  extractedText: string;
  signal?: AbortSignal;
  usageRecords?: ImportLlmUsageRecord[];
}): Promise<ResumeDocument> {
  const result = await completeOpenAiChatCompletion({
    backend: params.llm.backend,
    apiKey: params.llm.apiKey,
    model: params.llm.model,
    baseUrl: params.llm.baseUrl,
    systemPrompt: buildResumeImportSystemPrompt(),
    userContent: buildResumeImportUserPrompt(params.extractedText),
    signal: params.signal,
    responseFormat: { type: 'json_object' },
  });
  params.usageRecords?.push({
    source: LLM_USAGE_SOURCES.IMPORT_PARSE,
    model: params.llm.model,
    usage: result.usage,
  });

  let parsed: unknown;
  try {
    parsed = parseJsonFromLlmResponse(result.content);
  } catch {
    throw new OpenAiChatRequestError(
      'import_invalid_json',
      '简历解析结果格式无效，请稍后重试或换一份文件。',
      500,
    );
  }

  return normalizeImportedDocument(parsed);
}

export async function runImportLlmPipeline(params: {
  extractedText: string;
  imageBuffers: Buffer[];
  imageMime: string;
  signal?: AbortSignal;
  usageRecords?: ImportLlmUsageRecord[];
}): Promise<ResumeDocument> {
  const llm = resolveImportLlmEnv(process.env);
  if (!llm) {
    return loadStubImportDocument();
  }

  let text = params.extractedText.trim();
  const needsOcr =
    params.imageBuffers.length > 0 && text.length < PDF_TEXT_MIN_CHARS;

  if (needsOcr) {
    const vision = resolveImportVisionCreds(process.env);
    if (!vision) {
      throw new OpenAiChatRequestError(
        'import_vision_unavailable',
        '无法识别图片或扫描版 PDF，请粘贴纯文本或配置视觉模型（DASHSCOPE_VISION_MODEL）。',
        400,
      );
    }
    text = await ocrImagesToText({
      vision,
      imageBuffers: params.imageBuffers,
      mime: params.imageMime,
      signal: params.signal,
      usageRecords: params.usageRecords,
    });
  }

  if (!text.trim()) {
    throw new OpenAiChatRequestError(
      'import_empty_text',
      '未能从文件中提取有效文字，请尝试更清晰的 PDF 或粘贴纯文本。',
      400,
    );
  }

  return parseResumeFromText({
    llm,
    extractedText: text,
    signal: params.signal,
    usageRecords: params.usageRecords,
  });
}
