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
import { ChatAssistJobsService } from './chat-assist-jobs.service';

@Controller('chat-assist-jobs')
export class ChatAssistJobsController {
  constructor(private readonly chatAssistJobsService: ChatAssistJobsService) {}

  @Post()
  @UseGuards(SessionAuthGuard, CsrfGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  create(@Req() req: Request, @Body() body: unknown) {
    return this.chatAssistJobsService.createChatAssistJob(
      req.session.userId as string,
      body,
    );
  }

  @Get(':jobId')
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  getOne(@Req() req: Request, @Param('jobId') jobId: string) {
    return this.chatAssistJobsService.getChatAssistJob(
      req.session.userId as string,
      jobId,
    );
  }
}
