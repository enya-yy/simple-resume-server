export const CHAT_IMAGE_CHOICE_AVATAR_SUGGESTION = '设为用户头像';

/** 头像设置成功后的助手回复（确定性文案，不走 LLM）。 */
export function buildAvatarAppliedChatText(): string {
  return '好的，已经把这张图设为你的简历头像了。右侧预览区可以立刻看到效果；要是还想调整排版或润色某段经历，直接跟我说就行。';
}
