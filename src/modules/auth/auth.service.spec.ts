import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { UsersRepository } from './users.repository';
import { CreditsService } from '../credits/credits.service';

const baseUser = {
  id: 'u1',
  email: 'user@example.com',
  credits_balance: 30,
  plan: 'trial' as const,
  role: 'user' as const,
  disabled_at: null,
  last_access_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('AuthService', () => {
  let service: AuthService;
  let users: jest.Mocked<
    Pick<UsersRepository, 'create' | 'findByEmail' | 'findById'>
  >;
  let credits: jest.Mocked<Pick<CreditsService, 'getUsage'>>;

  beforeEach(() => {
    users = {
      create: jest.fn(),
      findByEmail: jest.fn(),
      findById: jest.fn(),
    };
    credits = {
      getUsage: jest.fn(),
    };
    service = new AuthService(
      users as unknown as UsersRepository,
      credits as unknown as CreditsService,
    );
  });

  it('register：校验失败抛出 VALIDATION_FAILED', async () => {
    const req = { session: {} } as Parameters<AuthService['register']>[0];
    await expect(
      service.register(req, { email: 'bad', password: 'short' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('login：用户不存在时泛化错误', async () => {
    users.findByEmail.mockResolvedValue(undefined);
    const req = { session: {} } as Parameters<AuthService['login']>[0];
    await expect(
      service.login(req, { email: 'user@example.com', password: 'password12' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login：密码错误时泛化错误', async () => {
    users.findByEmail.mockResolvedValue({
      ...baseUser,
      password_hash: await argon2.hash('other', { type: argon2.argon2id }),
    });
    const req = { session: {} } as Parameters<AuthService['login']>[0];
    await expect(
      service.login(req, { email: 'user@example.com', password: 'password12' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login：禁用账号返回 AUTH_ACCOUNT_DISABLED', async () => {
    users.findByEmail.mockResolvedValue({
      ...baseUser,
      password_hash: await argon2.hash('password12', {
        type: argon2.argon2id,
      }),
      disabled_at: '2025-01-01 00:00:00',
    });
    const req = { session: {} } as Parameters<AuthService['login']>[0];
    await expect(
      service.login(req, { email: 'user@example.com', password: 'password12' }),
    ).rejects.toMatchObject({
      response: { code: 'AUTH_ACCOUNT_DISABLED' },
    });
  });
});
