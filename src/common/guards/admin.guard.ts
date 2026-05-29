import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ERROR_CODES, USER_ROLES } from '../../contracts/index';
import { UsersRepository } from '../../modules/auth/users.repository';

@Injectable()
export class AdminGuard implements CanActivate {
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
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException({
        code: ERROR_CODES.AUTH_REQUIRED,
        message: '需要登录后才能访问',
      });
    }
    if (user.disabled_at) {
      throw new UnauthorizedException({
        code: ERROR_CODES.AUTH_ACCOUNT_DISABLED,
        message: '账号已禁用',
      });
    }
    if (user.role !== USER_ROLES.ADMIN) {
      throw new ForbiddenException({
        code: ERROR_CODES.AUTH_FORBIDDEN,
        message: '需要管理员权限',
      });
    }
    return true;
  }
}
