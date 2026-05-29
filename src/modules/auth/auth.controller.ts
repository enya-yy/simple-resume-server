import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { AuthService } from './auth.service';
import { CsrfService } from './csrf.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly csrf: CsrfService,
  ) {}

  @Get('csrf')
  getCsrf(@Req() req: Request) {
    if (!req.session.csrfSecret) {
      req.session.csrfSecret = this.csrf.createSecret();
    }
    const token = this.csrf.createToken(req.session.csrfSecret);
    return { csrfToken: token };
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(CsrfGuard)
  register(@Req() req: Request, @Body() body: unknown) {
    return this.auth.register(req, body);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(CsrfGuard)
  login(@Req() req: Request, @Body() body: unknown) {
    return this.auth.login(req, body);
  }

  @Post('logout')
  @UseGuards(CsrfGuard, SessionAuthGuard)
  async logout(@Req() req: Request) {
    await this.auth.logout(req);
    return { ok: true as const };
  }

  @Get('me')
  @SkipThrottle()
  @UseGuards(SessionAuthGuard)
  me(@Req() req: Request) {
    return this.auth.me(req.session.userId as string, req);
  }
}
