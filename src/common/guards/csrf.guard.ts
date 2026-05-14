import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { ERROR_CODES } from '../../contracts/index';
import { CsrfService } from '../../modules/auth/csrf.service';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly csrf: CsrfService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const token =
      (req.headers['x-csrf-token'] as string | undefined) ||
      (req.headers['csrf-token'] as string | undefined);
    const secret = req.session?.csrfSecret;

    if (!secret || !this.csrf.verify(secret, token)) {
      throw new ForbiddenException({
        code: ERROR_CODES.CSRF_INVALID,
        message: 'CSRF 校验失败',
      });
    }
    return true;
  }
}
