export const CHAT_INTENTS = {
  CREATE_RESUME: 'CREATE_RESUME',
  EDIT_BASIC_INFO: 'EDIT_BASIC_INFO',
  ADD_EXPERIENCE: 'ADD_EXPERIENCE',
  OPTIMIZE_TEXT: 'OPTIMIZE_TEXT',
  SHOW_PREVIEW: 'SHOW_PREVIEW',
  GENERAL_CHAT: 'GENERAL_CHAT',
  PATCH_FIELD: 'PATCH_FIELD',
} as const

export type ChatIntent = (typeof CHAT_INTENTS)[keyof typeof CHAT_INTENTS]

export const INTENT_RESPONSE_TYPE: Record<
  ChatIntent,
  'text' | 'form_card' | 'layout_command' | 'patch'
> = {
  CREATE_RESUME: 'form_card',
  EDIT_BASIC_INFO: 'form_card',
  ADD_EXPERIENCE: 'form_card',
  OPTIMIZE_TEXT: 'text',
  SHOW_PREVIEW: 'layout_command',
  GENERAL_CHAT: 'text',
  PATCH_FIELD: 'patch',
}
