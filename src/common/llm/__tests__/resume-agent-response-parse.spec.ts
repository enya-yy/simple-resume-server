import type OpenAI from 'openai';
import { parseResumeAgentTurn } from '../resume-agent-response-parse';

describe('parseResumeAgentTurn', () => {
  it('parses report_turn_meta alongside mutation tools', () => {
    const turn = parseResumeAgentTurn({
      role: 'assistant',
      content: '不应展示的长文',
      refusal: null,
      tool_calls: [
        {
          id: '1',
          type: 'function',
          function: {
            name: 'report_turn_meta',
            arguments: JSON.stringify({
              outcome: 'mutation_ok',
              intent: 'EDIT_BASIC_INFO',
              confidence: 0.95,
            }),
          },
        },
        {
          id: '2',
          type: 'function',
          function: {
            name: 'update_basics',
            arguments: JSON.stringify({ data: { fullName: '张三' } }),
          },
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionMessage);

    expect(turn.meta).toEqual({
      outcome: 'mutation_ok',
      intent: 'EDIT_BASIC_INFO',
      confidence: 0.95,
      clarifyHint: undefined,
    });
    expect(turn.mutationCalls).toHaveLength(1);
    expect(turn.mutationCalls[0]?.name).toBe('update_basics');
    expect(turn.responseText).toBe('不应展示的长文');
  });
});
