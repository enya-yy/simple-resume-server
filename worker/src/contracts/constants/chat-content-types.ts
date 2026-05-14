export const CHAT_CONTENT_TYPES = {
  TEXT: 'text',
  FORM_CARD: 'form_card',
  LAYOUT_COMMAND: 'layout_command',
} as const

export type ChatContentType = typeof CHAT_CONTENT_TYPES[keyof typeof CHAT_CONTENT_TYPES]
