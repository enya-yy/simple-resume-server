import type OpenAI from 'openai';
import {
  parseResumeAgentTurnMeta,
  RESUME_META_TOOL_NAME,
  type ResumeAgentTurnMeta,
} from '../../contracts/llm/resume-agent-meta';
import {
  RESUME_MUTATION_TOOL_NAMES,
  RESUME_UI_TOOL_NAMES,
} from './prompts/resume-agent.prompt';
import type { ResumeToolCall, ResumeToolName } from '../../contracts/llm/resume-agent-tools';

export type { ResumeAgentTurnMeta } from '../../contracts/llm/resume-agent-meta';

export type ResumeUiAction =
  | {
      type: 'form';
      formType: string;
      prefilledFields?: Record<string, string>;
      leadIn?: string;
    }
  | { type: 'preview' }
  | { type: 'polish'; itemId: string; bulletIndex?: number };

export type ResumeAgentTurn = {
  /** 模型正文（结构化模式下应为空，仅作兼容兜底） */
  responseText: string;
  meta: ResumeAgentTurnMeta | null;
  mutationCalls: ResumeToolCall[];
  uiActions: ResumeUiAction[];
};

const MUTATION_SET = new Set<string>(RESUME_MUTATION_TOOL_NAMES);
const UI_SET = new Set<string>(RESUME_UI_TOOL_NAMES);

function parseToolArguments(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* fall through */
  }
  return {};
}

export function parseResumeAgentTurn(
  message: OpenAI.Chat.Completions.ChatCompletionMessage | undefined,
): ResumeAgentTurn {
  const responseText = (message?.content ?? '').trim();
  const mutationCalls: ResumeToolCall[] = [];
  const uiActions: ResumeUiAction[] = [];
  let meta: ResumeAgentTurnMeta | null = null;

  for (const tc of message?.tool_calls ?? []) {
    if (tc.type !== 'function') continue;
    const name = tc.function.name;
    const args = parseToolArguments(tc.function.arguments ?? '{}');

    if (name === RESUME_META_TOOL_NAME) {
      meta = parseResumeAgentTurnMeta(args) ?? meta;
      continue;
    }

    if (MUTATION_SET.has(name)) {
      mutationCalls.push({
        name: name as ResumeToolName,
        arguments: args,
      });
      continue;
    }

    if (!UI_SET.has(name)) continue;

    if (name === 'show_preview') {
      uiActions.push({ type: 'preview' });
      continue;
    }

    if (name === 'request_polish') {
      const itemId = typeof args.itemId === 'string' ? args.itemId : '';
      if (!itemId.trim()) continue;
      const bulletIndex =
        typeof args.bulletIndex === 'number' &&
        Number.isInteger(args.bulletIndex) &&
        args.bulletIndex >= 0
          ? args.bulletIndex
          : undefined;
      uiActions.push({
        type: 'polish',
        itemId: itemId.trim(),
        bulletIndex,
      });
      continue;
    }

    if (name === 'show_form_card') {
      const formType =
        typeof args.formType === 'string' ? args.formType : 'basic_info';
      const prefilled =
        args.prefilledFields && typeof args.prefilledFields === 'object'
          ? (args.prefilledFields as Record<string, string>)
          : undefined;
      const leadIn = typeof args.leadIn === 'string' ? args.leadIn : undefined;
      uiActions.push({
        type: 'form',
        formType,
        prefilledFields: prefilled,
        leadIn,
      });
    }
  }

  return { responseText, meta, mutationCalls, uiActions };
}
