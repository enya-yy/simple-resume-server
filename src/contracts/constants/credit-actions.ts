export const CREDIT_ACTIONS = {
  CHAT_MESSAGE: 'chat_message',
  IMPORT: 'import',
  CHAT_ASSIST: 'chat_assist',
} as const;

export type CreditAction =
  (typeof CREDIT_ACTIONS)[keyof typeof CREDIT_ACTIONS];

export const USER_PLANS = {
  TRIAL: 'trial',
  SUBSCRIBED: 'subscribed',
} as const;

export type UserPlan = (typeof USER_PLANS)[keyof typeof USER_PLANS];

export const ADMIN_CREDIT_REASONS = {
  GRANT: 'admin_grant',
  ADJUST: 'admin_adjust',
} as const;

export type AdminCreditReason =
  (typeof ADMIN_CREDIT_REASONS)[keyof typeof ADMIN_CREDIT_REASONS];
