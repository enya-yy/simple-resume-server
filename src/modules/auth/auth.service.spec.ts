import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { UsersRepository } from './users.repository';

describe('AuthService', () => {
  let service: AuthService;
  let users: jest.Mocked<
    Pick<UsersRepository, 'create' | 'findByEmail' | 'findById'>
  >;

  beforeEach(() => {
    users = {
      create: jest.fn(),
      findByEmail: jest.fn(),
      findById: jest.fn(),
    };
    service = new AuthService(users as unknown as UsersRepository);
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
      id: 'u1',
      email: 'user@example.com',
      password_hash: await argon2.hash('other', { type: argon2.argon2id }),
      created_at: new Date(),
      updated_at: new Date(),
    });
    const req = { session: {} } as Parameters<AuthService['login']>[0];
    await expect(
      service.login(req, { email: 'user@example.com', password: 'password12' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
