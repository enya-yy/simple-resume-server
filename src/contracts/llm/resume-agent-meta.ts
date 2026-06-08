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

/** chat_only 这一轮的细分类型，用于决定回复语气与是否推送快捷操作。 */
export const CHAT_KINDS = {
  GREETING: 'greeting',
  SMALLTALK: 'smalltalk',
  HELP: 'help',
  UNCLEAR: 'unclear',
} as const;

export type ChatKind = (typeof CHAT_KINDS)[keyof typeof CHAT_KINDS];

const OUTCOME_SET = new Set<string>(Object.values(TURN_OUTCOMES));
const INTENT_SET = new Set<string>(Object.values(CHAT_INTENTS));
const CHAT_KIND_SET = new Set<string>(Object.values(CHAT_KINDS));

/** 寒暄 / 闲聊这类轻量对话，不挂载「猜你想做」快捷按钮，避免显得催促。 */
export function isCasualChatKind(kind?: ChatKind): boolean {
  return kind === CHAT_KINDS.GREETING || kind === CHAT_KINDS.SMALLTALK;
}

export type ResumeAgentTurnMeta = {
  outcome: TurnOutcome;
  intent: ChatIntent;
  confidence: number;
  clarifyHint?: string;
  chatKind?: ChatKind;
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

  const chatKind =
    typeof args.chatKind === 'string' && CHAT_KIND_SET.has(args.chatKind)
      ? (args.chatKind as ChatKind)
      : undefined;

  return {
    outcome: outcomeRaw as TurnOutcome,
    intent: intentRaw as ChatIntent,
    confidence,
    clarifyHint,
    chatKind,
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
  const inferred = inferResumeAgentTurnMeta({
    mutationCalls: input.mutationCalls,
    uiActions: input.uiActions,
    isSystemEvent: input.isSystemEvent,
  });
  if (!input.meta) return inferred;
  if (
    input.meta.outcome === TURN_OUTCOMES.CHAT_ONLY &&
    input.mutationCalls.length > 0 &&
    inferred.outcome !== TURN_OUTCOMES.CHAT_ONLY
  ) {
    return {
      ...input.meta,
      outcome: inferred.outcome,
      intent: inferred.intent,
    };
  }
  return input.meta;
}

function mutationLabels(calls: ResumeToolCall[]): string[] {
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
  return [...new Set(parts)];
}

function describeMutationReply(calls: ResumeToolCall[]): string | null {
  const unique = mutationLabels(calls);
  if (unique.length === 0) return null;
  if (unique.length === 1) {
    if (unique[0] === '一条经历') return '已删除一条经历。';
    return `已更新${unique[0]}。`;
  }
  return `已更新${unique.join('、')}。`;
}

function buildMutationMarkdown(calls: ResumeToolCall[]): string {
  const labels = mutationLabels(calls);
  if (labels.length === 0) {
    return '## 简历已更新\n\n更改已同步到右侧预览。\n\n**建议下一步：**\n- 检查预览内容\n- 继续补充其他模块';
  }
  if (labels.length === 1 && labels[0] === '一条经历') {
    return '## 已删除一条经历\n\n预览区已同步移除对应内容。\n\n**如需恢复：** 告诉我公司名或时间段，我可以帮你重新添加。';
  }
  const headline =
    labels.length === 1 ? `${labels[0]}已更新` : '简历内容已更新';
  const detail =
    labels.length === 1
      ? `**${labels[0]}** 已写入右侧简历预览。`
      : `本次更新了 **${labels.join('、')}**。`;
  return [
    `## ${headline}`,
    '',
    detail,
    '',
    '**建议下一步：**',
    '- 在预览区确认内容是否符合预期',
    '- 继续补充其他模块，或直接告诉我下一步想改什么',
  ].join('\n');
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

/** 根据结构化 meta 与本轮工具结果生成面向用户的 Markdown 回复。 */
export function buildAgentReply(input: BuildAgentReplyInput): string {
  const { meta } = input;

  if (meta.outcome === TURN_OUTCOMES.NEED_CLARIFICATION && meta.clarifyHint) {
    return [
      '## 还需要一点信息',
      '',
      meta.clarifyHint,
      '',
      '*补充具体细节后，我会立刻继续帮你处理。*',
    ].join('\n');
  }

  if (meta.outcome === TURN_OUTCOMES.NEED_CLARIFICATION) {
    return [
      '## 还需要一点信息',
      '',
      '请再说具体一点，例如要改**哪一段经历**、**哪个字段**，或希望达到什么效果。',
    ].join('\n');
  }

  if (meta.outcome === TURN_OUTCOMES.SYSTEM_ACK) {
    return [
      '## 已保存',
      '',
      '模块内容已成功写入简历，右侧预览已同步更新。',
    ].join('\n');
  }

  if (meta.outcome === TURN_OUTCOMES.SHOW_FORM || input.hasFormCard) {
    return [
      '## 请完善以下内容',
      '',
      '填写下方表单后，我会自动同步到简历预览。',
      '',
      '**填写提示：**',
      '- 带 * 的为必填项',
      '- 保存后可继续补充其他模块',
    ].join('\n');
  }

  if (meta.outcome === TURN_OUTCOMES.PREVIEW || input.hasPreview) {
    return [
      '## 预览已打开',
      '',
      '你可以在右侧查看当前简历排版与内容。',
      '',
      '**接下来可以：**',
      '- 更换模板样式',
      '- 继续对话修改具体内容',
    ].join('\n');
  }

  if (meta.outcome === TURN_OUTCOMES.POLISH || input.hasPolishJob) {
    return [
      '## 正在润色',
      '',
      '已开始优化描述文案，完成后会自动更新到简历。',
      '',
      '*润色期间你可以继续编辑其他模块。*',
    ].join('\n');
  }

  if (
    meta.outcome === TURN_OUTCOMES.MUTATION_OK ||
    (input.documentChanged && input.mutationCalls.length > 0)
  ) {
    if (input.toolErrors && input.toolErrors.length > 0) {
      const partial = describeMutationReply(input.mutationCalls);
      const base = buildMutationMarkdown(input.mutationCalls);
      return partial
        ? base.replace(
            /\n\n\*\*建议下一步：\*\*[\s\S]*$/,
            '\n\n> 部分字段未能更新，请检查内容后重试，或告诉我需要调整的地方。',
          )
        : '## 部分更新未成功\n\n请检查内容格式后重试，或告诉我具体要改哪一部分。';
    }
    const summary = describeMutationReply(input.mutationCalls);
    if (summary) return buildMutationMarkdown(input.mutationCalls);
    if (input.documentChanged) return buildMutationMarkdown([]);
  }

  if (meta.outcome === TURN_OUTCOMES.CHAT_ONLY) {
    // 寒暄 / 闲聊：用一句轻松的人话回应，不用标题卡，也不催促操作。
    // （模型若自带 ≤60 字的自然回复，会在上层优先采用，这里是兜底。）
    if (isCasualChatKind(meta.chatKind)) {
      return '你好呀～我可以帮你一起完善简历。想从哪部分开始都行，或者先跟我说说你的情况。';
    }
    // 明确求助「怎么用」：给一句说明 + 引导快捷操作。
    if (meta.chatKind === CHAT_KINDS.HELP) {
      return '我可以帮你修改简历的任意部分，比如基础信息、工作经历、项目或技能。直接告诉我想改哪里，或点选下方快捷操作。';
    }
    // 想改但没说清：温和地问一句，不用「## 我可以帮你」这种菜单腔。
    return '想先完善简历的哪一部分呢？可以直接描述需求，或点选下方快捷操作。';
  }

  return '还有什么想调整的？继续描述修改需求即可，或点选下方快捷操作。';
}
