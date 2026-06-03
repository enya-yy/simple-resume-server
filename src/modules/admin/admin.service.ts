import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ZodError } from 'zod';
import {
  ADMIN_CREDIT_REASONS,
  ERROR_CODES,
  adjustAdminCreditsBodySchema,
  adminCreditLedgerResponseSchema,
  adminUserDetailSchema,
  adminUsersListResponseSchema,
  patchAdminUserBodySchema,
} from '../../contracts/index';
import { CreditsRepository } from '../credits/credits.repository';
import { UsersRepository } from '../auth/users.repository';
import { serializeDbTimestamp } from '../../common/utils/serialize-db-timestamp';
import { AdminRepository } from './admin.repository';

function parseLimitOffset(query: Record<string, string | string[] | undefined>) {
  const rawLimit = Array.isArray(query.limit) ? query.limit[0] : query.limit;
  const rawOffset = Array.isArray(query.offset) ? query.offset[0] : query.offset;
  const limit = Math.min(100, Math.max(1, parseInt(rawLimit ?? '20', 10) || 20));
  const offset = Math.max(0, parseInt(rawOffset ?? '0', 10) || 0);
  return { limit, offset };
}

@Injectable()
export class AdminService {
  constructor(
    private readonly users: UsersRepository,
    private readonly credits: CreditsRepository,
    private readonly adminRepo: AdminRepository,
  ) {}

  async listUsers(query: Record<string, string | string[] | undefined>) {
    const q = Array.isArray(query.q) ? query.q[0] : query.q;
    const { limit, offset } = parseLimitOffset(query);
    const { rows, total } = await this.users.listUsers({ q, limit, offset });
    return adminUsersListResponseSchema.parse({
      items: rows.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        plan: u.plan,
        creditsBalance: u.credits_balance,
        disabledAt: serializeDbTimestamp(u.disabled_at),
        lastAccessAt: serializeDbTimestamp(u.last_access_at),
        createdAt: serializeDbTimestamp(u.created_at)!,
      })),
      total,
      limit,
      offset,
    });
  }

  async getUser(userId: string) {
    const user = await this.users.findAdminListItem(userId);
    if (!user) {
      throw new NotFoundException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: '用户不存在',
      });
    }
    const stats = await this.adminRepo.getUserStats(userId);
    return adminUserDetailSchema.parse({
      id: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
      creditsBalance: user.credits_balance,
      disabledAt: serializeDbTimestamp(user.disabled_at),
      lastAccessAt: serializeDbTimestamp(user.last_access_at),
      createdAt: serializeDbTimestamp(user.created_at)!,
      updatedAt: serializeDbTimestamp(user.updated_at)!,
      stats: {
        resumeCount: stats.resume_count,
        chatSessionCount: stats.chat_session_count,
        lastActivityAt: serializeDbTimestamp(stats.last_activity_at),
      },
    });
  }

  async patchUser(userId: string, body: unknown) {
    let parsed;
    try {
      parsed = patchAdminUserBodySchema.parse(body);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new BadRequestException({
          code: ERROR_CODES.VALIDATION_FAILED,
          message: '请求参数无效',
        });
      }
      throw e;
    }

    const exists = await this.users.findAdminListItem(userId);
    if (!exists) {
      throw new NotFoundException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: '用户不存在',
      });
    }

    if (parsed.plan !== undefined) {
      await this.users.setPlan(userId, parsed.plan);
    }
    if (parsed.disabled !== undefined) {
      await this.users.setDisabled(userId, parsed.disabled);
    }

    return this.getUser(userId);
  }

  async listLedger(
    userId: string,
    query: Record<string, string | string[] | undefined>,
  ) {
    const exists = await this.users.findAdminListItem(userId);
    if (!exists) {
      throw new NotFoundException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: '用户不存在',
      });
    }
    const { limit, offset } = parseLimitOffset(query);
    const { rows, total } = await this.credits.listLedger(userId, limit, offset);
    return adminCreditLedgerResponseSchema.parse({
      items: rows.map((e) => ({
        id: e.id,
        delta: e.delta,
        reason: e.reason,
        refId: e.ref_id,
        balanceAfter: e.balance_after,
        createdAt: serializeDbTimestamp(e.created_at)!,
      })),
      total,
      limit,
      offset,
    });
  }

  async adjustCredits(userId: string, body: unknown) {
    let parsed;
    try {
      parsed = adjustAdminCreditsBodySchema.parse(body);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new BadRequestException({
          code: ERROR_CODES.VALIDATION_FAILED,
          message: '请求参数无效',
        });
      }
      throw e;
    }

    const exists = await this.users.findAdminListItem(userId);
    if (!exists) {
      throw new NotFoundException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: '用户不存在',
      });
    }

    const reason =
      parsed.delta > 0
        ? ADMIN_CREDIT_REASONS.GRANT
        : ADMIN_CREDIT_REASONS.ADJUST;

    const balance = await this.credits.adjustCredits(
      userId,
      parsed.delta,
      reason,
      parsed.note,
    );
    if (balance === undefined) {
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: '积分调整后余额不能为负',
      });
    }

    return { balance };
  }
}
