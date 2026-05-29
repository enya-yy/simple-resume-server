import { z } from 'zod';
import { USER_PLANS } from '../constants/credit-actions';
import { USER_ROLES } from '../constants/user-roles';

export const userCreditsSchema = z.object({
  balance: z.number().int().nonnegative(),
  plan: z.enum([USER_PLANS.TRIAL, USER_PLANS.SUBSCRIBED]),
  trialInitial: z.number().int().positive(),
});

export const authMeResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum([USER_ROLES.USER, USER_ROLES.ADMIN]),
  credits: userCreditsSchema,
});

export type UserCredits = z.infer<typeof userCreditsSchema>;
export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;
