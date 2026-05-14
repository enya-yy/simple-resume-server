import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { ERROR_CODES } from '../../contracts/index';
import { parseEnv } from '../../config/env.schema';

function extractOpsToken(req: Request): string | undefined {
  const header = req.headers['x-ops-token'];
  if (typeof header === 'string' && header.length > 0) {
    return header.trim();
  }
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return undefined;
}

function safeCompareSecret(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) {
    return false;
  }
  return timingSafeEqual(Uint8Array.from(ba), Uint8Array.from(bb));
}

@Injectable()
export class OpsMetricsTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const env = parseEnv(process.env);
    const expected = env.OPS_METRICS_TOKEN;
    if (!expected) {
      throw new ServiceUnavailableException({
        code: ERROR_CODES.OPS_METRICS_NOT_CONFIGURED,
        message: '运营指标接口未配置',
      });
    }
    const got = extractOpsToken(req);
    if (!got || !safeCompareSecret(got, expected)) {
      throw new UnauthorizedException({
        code: ERROR_CODES.OPS_METRICS_UNAUTHORIZED,
        message: '未授权',
      });
    }
    return true;
  }
}
