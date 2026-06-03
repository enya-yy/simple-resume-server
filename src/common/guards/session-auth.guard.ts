import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ERROR_CODES } from '../../contracts/index';
import { UsersRepository } from '../../modules/auth/users.repository';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly users: UsersRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const userId = req.session?.userId;
    if (!userId) {
      throw new UnauthorizedException({
        code: ERROR_CODES.AUTH_REQUIRED,
        message: '需要登录后才能访问',
      });
    }
    if (await this.users.isDisabled(userId)) {
      throw new UnauthorizedException({
        code: ERROR_CODES.AUTH_ACCOUNT_DISABLED,
        message: '账号已禁用',
      });
    }
    void this.users.touchLastAccess(userId);
    return true;
  }
}
