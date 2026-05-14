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
import { PolishJobsService } from './polish-jobs.service';

@Controller('polish-jobs')
export class PolishJobsController {
  constructor(private readonly polishJobsService: PolishJobsService) {}

  @Post()
  @UseGuards(SessionAuthGuard, CsrfGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  create(@Req() req: Request, @Body() body: unknown) {
    return this.polishJobsService.createPolishJob(
      req.session.userId as string,
      body,
      req.requestId,
    );
  }

  @Get(':jobId')
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  getOne(@Req() req: Request, @Param('jobId') jobId: string) {
    return this.polishJobsService.getPolishJob(
      req.session.userId as string,
      jobId,
    );
  }
}
