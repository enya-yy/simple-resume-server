import {
  buildAgentReply,
  inferResumeAgentTurnMeta,
  parseResumeAgentTurnMeta,
  resolveResumeAgentTurnMeta,
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
  it('uses clarify hint', () => {
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
    ).toBe('要改哪一段字节经历？');
  });

  it('describes basics mutation', () => {
    expect(
      buildAgentReply({
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
      }),
    ).toBe('已更新基本信息。');
  });
});

describe('resolveResumeAgentTurnMeta', () => {
  it('prefers parsed meta over inference', () => {
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
    expect(resolved.outcome).toBe('chat_only');
  });
});
