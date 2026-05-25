import {
  CHAT_INTENTS,
  type ChatIntent,
} from '../constants/chat-intents';
import type { ResumeToolCall } from './resume-agent-tools';

export const RESUME_META_TOOL_NAME = 'report_turn_meta' as const;

export const TURN_OUTCOMES = {
  MUTATION_OK: 'mutation_ok',
  NEED_CLARIFICATION: 'need_clarification',
  SHOW_FORM: 'show_form',
  POLISH: 'polish',
  PREVIEW: 'preview',
  CHAT_ONLY: 'chat_only',
  SYSTEM_ACK: 'system_ack',
} as const;

export type TurnOutcome = (typeof TURN_OUTCOMES)[keyof typeof TURN_OUTCOMES];

const OUTCOME_SET = new Set<string>(Object.values(TURN_OUTCOMES));
const INTENT_SET = new Set<string>(Object.values(CHAT_INTENTS));

export type ResumeAgentTurnMeta = {
  outcome: TurnOutcome;
  intent: ChatIntent;
  confidence: number;
  clarifyHint?: string;
};

export type ResumeUiActionLike =
  | {
      type: 'form';
      formType: string;
      prefilledFields?: Record<string, string>;
      leadIn?: string;
    }
  | { type: 'preview' }
  | { type: 'polish'; itemId: string; bulletIndex?: number };

export function parseResumeAgentTurnMeta(
  args: Record<string, unknown>,
): ResumeAgentTurnMeta | null {
  const outcomeRaw = typeof args.outcome === 'string' ? args.outcome : '';
  const intentRaw = typeof args.intent === 'string' ? args.intent : '';
  if (!OUTCOME_SET.has(outcomeRaw) || !INTENT_SET.has(intentRaw)) {
    return null;
  }

  const confidence =
    typeof args.confidence === 'number' &&
    Number.isFinite(args.confidence)
      ? Math.min(1, Math.max(0, args.confidence))
      : 0.8;

  const clarifyHint =
    typeof args.clarifyHint === 'string' && args.clarifyHint.trim()
      ? args.clarifyHint.trim().slice(0, 80)
      : undefined;

  return {
    outcome: outcomeRaw as TurnOutcome,
    intent: intentRaw as ChatIntent,
    confidence,
    clarifyHint,
  };
}

function intentFromFormType(formType: string): ChatIntent {
  switch (formType) {
    case 'basic_info':
      return CHAT_INTENTS.EDIT_BASIC_INFO;
    case 'experience':
      return CHAT_INTENTS.ADD_EXPERIENCE;
    case 'education':
    case 'project':
    case 'skill':
      return CHAT_INTENTS.CREATE_RESUME;
    default:
      return CHAT_INTENTS.CREATE_RESUME;
  }
}

function intentFromMutations(calls: ResumeToolCall[]): ChatIntent {
  if (calls.some((c) => c.name === 'update_basics')) {
    return CHAT_INTENTS.EDIT_BASIC_INFO;
  }
  if (calls.some((c) => c.name === 'add_section_item')) {
    const t = calls.find((c) => c.name === 'add_section_item')?.arguments
      .moduleType;
    if (t === 'experience') return CHAT_INTENTS.ADD_EXPERIENCE;
    return CHAT_INTENTS.CREATE_RESUME;
  }
  if (calls.length > 0) return CHAT_INTENTS.PATCH_FIELD;
  return CHAT_INTENTS.GENERAL_CHAT;
}

function outcomeFromTurn(input: {
  isSystemEvent?: boolean;
  mutationCalls: ResumeToolCall[];
  uiActions: ResumeUiActionLike[];
}): TurnOutcome {
  if (input.isSystemEvent) return TURN_OUTCOMES.SYSTEM_ACK;
  if (input.uiActions.some((a) => a.type === 'polish')) {
    return TURN_OUTCOMES.POLISH;
  }
  if (input.uiActions.some((a) => a.type === 'preview')) {
    return TURN_OUTCOMES.PREVIEW;
  }
  if (input.uiActions.some((a) => a.type === 'form')) {
    return TURN_OUTCOMES.SHOW_FORM;
  }
  if (input.mutationCalls.length > 0) return TURN_OUTCOMES.MUTATION_OK;
  return TURN_OUTCOMES.CHAT_ONLY;
}

/** 模型未调用 report_turn_meta 时，根据工具调用推断 meta。 */
export function inferResumeAgentTurnMeta(input: {
  mutationCalls: ResumeToolCall[];
  uiActions: ResumeUiActionLike[];
  isSystemEvent?: boolean;
}): ResumeAgentTurnMeta {
  const outcome = outcomeFromTurn(input);
  const formAction = input.uiActions.find((a) => a.type === 'form');

  let intent: ChatIntent = CHAT_INTENTS.GENERAL_CHAT;
  if (outcome === TURN_OUTCOMES.SYSTEM_ACK) {
    intent = CHAT_INTENTS.GENERAL_CHAT;
  } else if (outcome === TURN_OUTCOMES.POLISH) {
    intent = CHAT_INTENTS.OPTIMIZE_TEXT;
  } else if (outcome === TURN_OUTCOMES.PREVIEW) {
    intent = CHAT_INTENTS.SHOW_PREVIEW;
  } else if (formAction && formAction.type === 'form') {
    intent = intentFromFormType(formAction.formType);
  } else if (outcome === TURN_OUTCOMES.MUTATION_OK) {
    intent = intentFromMutations(input.mutationCalls);
  }

  return { outcome, intent, confidence: 0.75 };
}

export function resolveResumeAgentTurnMeta(input: {
  meta: ResumeAgentTurnMeta | null;
  mutationCalls: ResumeToolCall[];
  uiActions: ResumeUiActionLike[];
  isSystemEvent?: boolean;
}): ResumeAgentTurnMeta {
  if (input.meta) return input.meta;
  return inferResumeAgentTurnMeta({
    mutationCalls: input.mutationCalls,
    uiActions: input.uiActions,
    isSystemEvent: input.isSystemEvent,
  });
}

function describeMutationReply(calls: ResumeToolCall[]): string | null {
  const parts: string[] = [];
  for (const call of calls) {
    switch (call.name) {
      case 'update_basics':
        parts.push('基本信息');
        break;
      case 'add_section_item': {
        const t = call.arguments.moduleType;
        if (t === 'experience') parts.push('工作经历');
        else if (t === 'education') parts.push('教育经历');
        else if (t === 'project') parts.push('项目经历');
        else if (t === 'skill') parts.push('技能');
        else parts.push('简历条目');
        break;
      }
      case 'update_section_item':
        parts.push('条目内容');
        break;
      case 'patch_item_bullets':
        parts.push('描述要点');
        break;
      case 'delete_section_item':
        parts.push('一条经历');
        break;
      default:
        break;
    }
  }
  const unique = [...new Set(parts)];
  if (unique.length === 0) return null;
  if (unique.length === 1) {
    if (unique[0] === '一条经历') return '已删除一条经历。';
    return `已更新${unique[0]}。`;
  }
  return `已更新${unique.join('、')}。`;
}

export type BuildAgentReplyInput = {
  meta: ResumeAgentTurnMeta;
  documentChanged: boolean;
  mutationCalls: ResumeToolCall[];
  toolErrors?: string[];
  hasFormCard: boolean;
  hasPreview: boolean;
  hasPolishJob: boolean;
};

/** 根据结构化 meta 与本轮工具结果生成面向用户的短回复（模板，非模型长文）。 */
export function buildAgentReply(input: BuildAgentReplyInput): string {
  const { meta } = input;

  if (meta.outcome === TURN_OUTCOMES.NEED_CLARIFICATION && meta.clarifyHint) {
    return meta.clarifyHint;
  }

  if (meta.outcome === TURN_OUTCOMES.NEED_CLARIFICATION) {
    return '请再说具体一点，例如要改哪一段经历。';
  }

  if (meta.outcome === TURN_OUTCOMES.SYSTEM_ACK) {
    return '已保存。';
  }

  if (meta.outcome === TURN_OUTCOMES.SHOW_FORM || input.hasFormCard) {
    return '请按下方表单填写。';
  }

  if (meta.outcome === TURN_OUTCOMES.PREVIEW || input.hasPreview) {
    return '已打开简历预览。';
  }

  if (meta.outcome === TURN_OUTCOMES.POLISH || input.hasPolishJob) {
    return '已开始润色，完成后会更新到简历。';
  }

  if (
    meta.outcome === TURN_OUTCOMES.MUTATION_OK ||
    (input.documentChanged && input.mutationCalls.length > 0)
  ) {
    if (input.toolErrors && input.toolErrors.length > 0) {
      const partial = describeMutationReply(input.mutationCalls);
      return partial
        ? `${partial.replace(/。$/, '')}，另有部分未能更新。`
        : '部分更新未成功，请再说具体一点。';
    }
    const summary = describeMutationReply(input.mutationCalls);
    if (summary) return summary;
    if (input.documentChanged) return '已更新简历。';
  }

  if (meta.outcome === TURN_OUTCOMES.CHAT_ONLY) {
    return '可以说说想改简历哪一部分，或直接点下方快捷操作。';
  }

  return '好的，还有什么需要帮忙的吗？';
}
