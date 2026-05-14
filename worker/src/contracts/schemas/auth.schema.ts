import { z } from "zod";

/** 密码最小长度（与后端校验一致；前端可复用） */
export const PASSWORD_MIN_LENGTH = 8;

export const registerBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(PASSWORD_MIN_LENGTH),
});

export const loginBodySchema = registerBodySchema;

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
