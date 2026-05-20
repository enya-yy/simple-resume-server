import type OpenAI from 'openai';
import { intentResultSchema, type IntentResult } from '../../contracts/index';

export type IntentDispatchStrategy =
  | 'tool_required'
  | 'tool_auto'
  | 'json_content';

/** DeepSeek reasoner 等模型拒绝强制 function tool_choice 时的典型报错 */
export function isToolChoiceUnsupportedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /tool_choice|does not support this tool/i.test(msg);
}

/** 从模型正文里提取 JSON（兼容纯 JSON、markdown 代码块、前后夹杂说明文字） */
export function parseJsonFromModelText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('empty response content');
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim());
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }

  throw new Error('invalid response content json');
}

export function parseIntentFromCompletionMessage(
  message: OpenAI.Chat.Completions.ChatCompletionMessage | undefined,
): IntentResult {
  const toolCall = message?.tool_calls?.[0];
  if (toolCall?.type === 'function' && toolCall.function.arguments) {
    try {
      const raw = JSON.parse(toolCall.function.arguments);
      return intentResultSchema.parse(raw);
    } catch {
      throw new Error('invalid tool arguments json');
    }
  }

  const content = message?.content ?? '';
  const raw = parseJsonFromModelText(content);
  return intentResultSchema.parse(raw);
}
