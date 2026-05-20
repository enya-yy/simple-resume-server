import {
  isToolChoiceUnsupportedError,
  parseJsonFromModelText,
} from '../intent-response-parse';

describe('isToolChoiceUnsupportedError', () => {
  it('detects deepseek tool_choice errors', () => {
    expect(
      isToolChoiceUnsupportedError(
        new Error('400 deepseek-reasoner does not support this tool_choice'),
      ),
    ).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isToolChoiceUnsupportedError(new Error('timeout'))).toBe(false);
  });
});

describe('parseJsonFromModelText', () => {
  it('parses raw JSON object', () => {
    expect(
      parseJsonFromModelText(
        '{"intent":"CREATE_RESUME","confidence":0.9,"responseText":"ok"}',
      ),
    ).toEqual({
      intent: 'CREATE_RESUME',
      confidence: 0.9,
      responseText: 'ok',
    });
  });

  it('parses JSON inside markdown fence', () => {
    const raw = parseJsonFromModelText(
      '说明如下：\n```json\n{"intent":"GENERAL_CHAT","confidence":0.5,"responseText":"hi"}\n```',
    );
    expect(raw).toEqual({
      intent: 'GENERAL_CHAT',
      confidence: 0.5,
      responseText: 'hi',
    });
  });

  it('parses JSON surrounded by prose', () => {
    const raw = parseJsonFromModelText(
      '结果：{"intent":"ADD_EXPERIENCE","confidence":0.8,"responseText":"添加"} 完毕',
    );
    expect(raw).toMatchObject({ intent: 'ADD_EXPERIENCE' });
  });
});
