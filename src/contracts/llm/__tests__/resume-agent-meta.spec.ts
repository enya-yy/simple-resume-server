import {
  buildAgentReply,
  inferResumeAgentTurnMeta,
  isCasualChatKind,
  parseResumeAgentTurnMeta,
  resolveResumeAgentTurnMeta,
  CHAT_KINDS,
  TURN_OUTCOMES,
} from '../resume-agent-meta';
import { CHAT_INTENTS } from '../../constants/chat-intents';

describe('parseResumeAgentTurnMeta', () => {
  it('parses valid meta', () => {
    const meta = parseResumeAgentTurnMeta({
      outcome: 'mutation_ok',
      intent: 'EDIT_BASIC_INFO',
      confidence: 0.9,
    });
    expect(meta).toEqual({
      outcome: 'mutation_ok',
      intent: 'EDIT_BASIC_INFO',
      confidence: 0.9,
      clarifyHint: undefined,
    });
  });

  it('rejects invalid outcome', () => {
    expect(
      parseResumeAgentTurnMeta({
        outcome: 'unknown',
        intent: 'GENERAL_CHAT',
        confidence: 1,
      }),
    ).toBeNull();
  });

  it('parses chatKind for chat_only turns', () => {
    const meta = parseResumeAgentTurnMeta({
      outcome: 'chat_only',
      intent: 'GENERAL_CHAT',
      confidence: 0.5,
      chatKind: 'greeting',
    });
    expect(meta?.chatKind).toBe(CHAT_KINDS.GREETING);
  });

  it('drops unknown chatKind', () => {
    const meta = parseResumeAgentTurnMeta({
      outcome: 'chat_only',
      intent: 'GENERAL_CHAT',
      confidence: 0.5,
      chatKind: 'ranting',
    });
    expect(meta?.chatKind).toBeUndefined();
  });
});

describe('isCasualChatKind', () => {
  it('treats greeting and smalltalk as casual', () => {
    expect(isCasualChatKind(CHAT_KINDS.GREETING)).toBe(true);
    expect(isCasualChatKind(CHAT_KINDS.SMALLTALK)).toBe(true);
  });

  it('treats help/unclear/undefined as non-casual', () => {
    expect(isCasualChatKind(CHAT_KINDS.HELP)).toBe(false);
    expect(isCasualChatKind(CHAT_KINDS.UNCLEAR)).toBe(false);
    expect(isCasualChatKind(undefined)).toBe(false);
  });
});

describe('inferResumeAgentTurnMeta', () => {
  it('infers polish intent', () => {
    const meta = inferResumeAgentTurnMeta({
      mutationCalls: [],
      uiActions: [{ type: 'polish', itemId: 'id-1' }],
    });
    expect(meta.outcome).toBe(TURN_OUTCOMES.POLISH);
    expect(meta.intent).toBe(CHAT_INTENTS.OPTIMIZE_TEXT);
  });

  it('infers system ack', () => {
    const meta = inferResumeAgentTurnMeta({
      mutationCalls: [],
      uiActions: [],
      isSystemEvent: true,
    });
    expect(meta.outcome).toBe(TURN_OUTCOMES.SYSTEM_ACK);
  });
});

describe('buildAgentReply', () => {
  it('uses clarify hint in markdown', () => {
    expect(
      buildAgentReply({
        meta: {
          outcome: TURN_OUTCOMES.NEED_CLARIFICATION,
          intent: CHAT_INTENTS.GENERAL_CHAT,
          confidence: 0.9,
          clarifyHint: '要改哪一段字节经历？',
        },
        documentChanged: false,
        mutationCalls: [],
        hasFormCard: false,
        hasPreview: false,
        hasPolishJob: false,
      }),
    ).toContain('要改哪一段字节经历？');
  });

  it('describes basics mutation as markdown', () => {
    const reply = buildAgentReply({
      meta: {
        outcome: TURN_OUTCOMES.MUTATION_OK,
        intent: CHAT_INTENTS.EDIT_BASIC_INFO,
        confidence: 1,
      },
      documentChanged: true,
      mutationCalls: [{ name: 'update_basics', arguments: { data: {} } }],
      hasFormCard: false,
      hasPreview: false,
      hasPolishJob: false,
    });
    expect(reply).toContain('## 基本信息已更新');
    expect(reply).toContain('**基本信息**');
  });

  it('greets warmly without a heading card for casual chat', () => {
    const reply = buildAgentReply({
      meta: {
        outcome: TURN_OUTCOMES.CHAT_ONLY,
        intent: CHAT_INTENTS.GENERAL_CHAT,
        confidence: 0.6,
        chatKind: CHAT_KINDS.GREETING,
      },
      documentChanged: false,
      mutationCalls: [],
      hasFormCard: false,
      hasPreview: false,
      hasPolishJob: false,
    });
    expect(reply).not.toContain('##');
    expect(reply).toContain('你好');
  });

  it('gives guidance for help chat', () => {
    const reply = buildAgentReply({
      meta: {
        outcome: TURN_OUTCOMES.CHAT_ONLY,
        intent: CHAT_INTENTS.GENERAL_CHAT,
        confidence: 0.6,
        chatKind: CHAT_KINDS.HELP,
      },
      documentChanged: false,
      mutationCalls: [],
      hasFormCard: false,
      hasPreview: false,
      hasPolishJob: false,
    });
    expect(reply).toContain('快捷操作');
  });
});

describe('resolveResumeAgentTurnMeta', () => {
  it('reconciles chat_only meta when mutations were applied', () => {
    const parsed = parseResumeAgentTurnMeta({
      outcome: 'chat_only',
      intent: 'GENERAL_CHAT',
      confidence: 0.5,
    })!;
    const resolved = resolveResumeAgentTurnMeta({
      meta: parsed,
      mutationCalls: [{ name: 'update_basics', arguments: { data: {} } }],
      uiActions: [],
    });
    expect(resolved.outcome).toBe('mutation_ok');
    expect(resolved.intent).toBe(CHAT_INTENTS.EDIT_BASIC_INFO);
  });
});
