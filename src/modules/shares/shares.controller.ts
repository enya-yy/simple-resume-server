import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { SharesService } from './shares.service';

@Controller('shares')
export class SharesController {
  constructor(private readonly sharesService: SharesService) {}

  @Post()
  @UseGuards(SessionAuthGuard, CsrfGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  create(@Req() req: Request, @Body() body: unknown) {
    return this.sharesService.createShare(req.session.userId as string, body);
  }

  @Get(':shareToken/meta')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  meta(@Param('shareToken') shareToken: string) {
    return this.sharesService.getShareMeta(shareToken);
  }

  @Post(':shareToken/verify-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  verifyPassword(
    @Req() req: Request,
    @Param('shareToken') shareToken: string,
    @Body() body: unknown,
  ) {
    return this.sharesService.verifySharePassword(req, shareToken, body);
  }

  @Get(':shareToken')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  readOnly(@Req() req: Request, @Param('shareToken') shareToken: string) {
    return this.sharesService.getReadOnlyShare(req, shareToken);
  }
}
