import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import type { Request } from 'express';
import {
  ERROR_CODES,
  authMeResponseSchema,
  loginBodySchema,
  registerBodySchema,
} from '../../contracts/index';
import { ZodError } from 'zod';
import { parseEnv } from '../../config/env.schema';
import { CreditsService } from '../credits/credits.service';
import { UsersRepository } from './users.repository';

const GENERIC_AUTH_MESSAGE = '邮箱或密码不正确';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly credits: CreditsService,
  ) {}

  private regenerateSession(req: Request): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });
  }

  async register(req: Request, body: unknown) {
    let parsed;
    try {
      parsed = registerBodySchema.parse(body);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new BadRequestException({
          code: ERROR_CODES.VALIDATION_FAILED,
          message: '请求参数无效',
        });
      }
      throw e;
    }

    const hash = await argon2.hash(parsed.password, { type: argon2.argon2id });
    const trialCredits = parseEnv(process.env).TRIAL_CREDITS_INITIAL;

    try {
      const user = await this.users.create(parsed.email, hash, trialCredits);
      await this.users.touchLastAccess(user.id);
      await this.regenerateSession(req);
      req.session.userId = user.id;
      return { userId: user.id };
    } catch (err: unknown) {
      const pg = err as { code?: string };
      if (pg.code === '23505') {
        throw new UnauthorizedException({
          code: ERROR_CODES.AUTH_INVALID_CREDENTIALS,
          message: GENERIC_AUTH_MESSAGE,
        });
      }
      throw err;
    }
  }

  async login(req: Request, body: unknown) {
    let parsed;
    try {
      parsed = loginBodySchema.parse(body);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new BadRequestException({
          code: ERROR_CODES.VALIDATION_FAILED,
          message: '请求参数无效',
        });
      }
      throw e;
    }

    const user = await this.users.findByEmail(parsed.email);
    if (!user) {
      throw new UnauthorizedException({
        code: ERROR_CODES.AUTH_INVALID_CREDENTIALS,
        message: GENERIC_AUTH_MESSAGE,
      });
    }

    const ok = await argon2.verify(user.password_hash, parsed.password);
    if (!ok) {
      throw new UnauthorizedException({
        code: ERROR_CODES.AUTH_INVALID_CREDENTIALS,
        message: GENERIC_AUTH_MESSAGE,
      });
    }

    if (user.disabled_at) {
      throw new UnauthorizedException({
        code: ERROR_CODES.AUTH_ACCOUNT_DISABLED,
        message: '账号已禁用',
      });
    }

    await this.users.touchLastAccess(user.id);
    await this.regenerateSession(req);
    req.session.userId = user.id;
    return { userId: user.id };
  }

  async logout(req: Request): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      req.session.destroy((err) => (err ? reject(err) : resolve()));
    });
  }

  async me(userId: string, req?: Request) {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException({
        code: ERROR_CODES.AUTH_REQUIRED,
        message: '需要登录后才能访问',
      });
    }
    if (user.disabled_at) {
      if (req) {
        await this.logout(req);
      }
      throw new UnauthorizedException({
        code: ERROR_CODES.AUTH_ACCOUNT_DISABLED,
        message: '账号已禁用',
      });
    }
    return authMeResponseSchema.parse({
      id: user.id,
      email: user.email,
      role: user.role,
      credits: await this.credits.getUsage(userId),
    });
  }
}
