import { z } from 'zod';
import { CHAT_INTENTS } from '../constants/chat-intents';

export const intentResultSchema = z.object({
  intent: z.enum([
    CHAT_INTENTS.CREATE_RESUME,
    CHAT_INTENTS.EDIT_BASIC_INFO,
    CHAT_INTENTS.ADD_EXPERIENCE,
    CHAT_INTENTS.OPTIMIZE_TEXT,
    CHAT_INTENTS.SHOW_PREVIEW,
    CHAT_INTENTS.GENERAL_CHAT,
    CHAT_INTENTS.PATCH_FIELD,
  ]),
  confidence: z.number().min(0).max(1),
  extractedFields: z.record(z.string(), z.string()).optional(),
  responseText: z.string(),
});

export type IntentResult = z.infer<typeof intentResultSchema>;
