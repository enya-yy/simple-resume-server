import { buildAvatarAppliedChatText } from '../avatar-applied-messages';

describe('buildAvatarAppliedChatText', () => {
  it('returns confirmation text without follow-up suggestions', () => {
    const text = buildAvatarAppliedChatText();
    expect(text).toContain('简历头像');
    expect(text).toContain('预览区');
  });
});
