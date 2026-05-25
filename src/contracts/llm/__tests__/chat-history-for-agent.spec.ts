import {
  buildChatHistoryForAgent,
  estimateChatHistoryTokens,
} from '../chat-history-for-agent';
import type { ChatHistorySourceMessage } from '../chat-history-for-agent';

function msg(
  partial: Partial<ChatHistorySourceMessage> &
    Pick<ChatHistorySourceMessage, 'role' | 'content_json'>,
): ChatHistorySourceMessage {
  return {
    content_type: 'text',
    ...partial,
  };
}

describe('buildChatHistoryForAgent', () => {
  it('maps user/assistant text and compresses form cards', () => {
    const history = buildChatHistoryForAgent([
      msg({
        role: 'user',
        content_json: { type: 'text', text: '我叫张三' },
      }),
      msg({
        role: 'assistant',
        content_json: { type: 'text', text: '好的，已更新基本信息。' },
      }),
      msg({
        role: 'assistant',
        content_type: 'form_card',
        content_json: {
          type: 'form_card',
          formType: 'experience',
          leadIn: '请填写你的工作经历',
        },
      }),
    ]);

    expect(history).toEqual([
      { role: 'user', content: '我叫张三' },
      { role: 'assistant', content: '好的，已更新基本信息。' },
      {
        role: 'assistant',
        content: '[已展示 工作经历 表单，引导：请填写你的工作经历]',
      },
    ]);
  });

  it('prefixes system events for the model', () => {
    const history = buildChatHistoryForAgent([
      msg({
        role: 'system',
        content_json: { type: 'text', text: '基础信息模块已保存成功' },
      }),
    ]);

    expect(history[0]).toEqual({
      role: 'user',
      content: '[系统事件] 基础信息模块已保存成功',
    });
  });

  it('keeps at most 12 messages', () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      msg({
        role: 'user',
        content_json: { type: 'text', text: `消息${i}` },
      }),
    );
    expect(buildChatHistoryForAgent(rows)).toHaveLength(12);
    expect(buildChatHistoryForAgent(rows)[0]?.content).toBe('消息8');
  });

  it('trims oldest messages when token budget exceeded', () => {
    const long = '长'.repeat(400);
    const rows = Array.from({ length: 8 }, () =>
      msg({
        role: 'user',
        content_json: { type: 'text', text: long },
      }),
    );
    const history = buildChatHistoryForAgent(rows, { maxTokens: 600 });
    expect(history.length).toBeLessThan(8);
    expect(history.length).toBeGreaterThanOrEqual(4);
  });
});

describe('estimateChatHistoryTokens', () => {
  it('returns positive estimate for non-empty history', () => {
    const tokens = estimateChatHistoryTokens([
      { role: 'user', content: '你好' },
    ]);
    expect(tokens).toBeGreaterThan(0);
  });
});
