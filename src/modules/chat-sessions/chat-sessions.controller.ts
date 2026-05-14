import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { ChatSessionsService } from './chat-sessions.service';

@Controller('chat-sessions')
@UseGuards(SessionAuthGuard)
export class ChatSessionsController {
  constructor(private readonly chatSessionsService: ChatSessionsService) {}

  @Get()
  listSessions(@Req() req: Request) {
    return this.chatSessionsService.listSessions(req.session.userId as string);
  }

  @Post()
  @UseGuards(CsrfGuard)
  createSession(@Req() req: Request, @Body() body: unknown) {
    return this.chatSessionsService.createSession(
      req.session.userId as string,
      body,
    );
  }

  @Patch(':sessionId')
  @UseGuards(CsrfGuard)
  patchSession(
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
  ) {
    return this.chatSessionsService.patchSession(
      req.session.userId as string,
      sessionId,
      body,
    );
  }

  @Delete(':sessionId')
  @UseGuards(CsrfGuard)
  deleteSession(@Req() req: Request, @Param('sessionId') sessionId: string) {
    return this.chatSessionsService.deleteSession(
      req.session.userId as string,
      sessionId,
    );
  }

  @Get(':sessionId/messages')
  listMessages(@Req() req: Request, @Param('sessionId') sessionId: string) {
    return this.chatSessionsService.listMessages(
      req.session.userId as string,
      sessionId,
    );
  }

  @Patch(':sessionId/messages/:messageId')
  @UseGuards(CsrfGuard)
  patchFormCardMessage(
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
    @Param('messageId') messageId: string,
    @Body() body: unknown,
  ) {
    return this.chatSessionsService.patchFormCardMessage(
      req.session.userId as string,
      sessionId,
      messageId,
      body,
    );
  }

  @Post(':sessionId/messages')
  @UseGuards(CsrfGuard)
  async sendMessage(
    @Req() req: Request,
    @Res() res: Response,
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
  ) {
    await this.chatSessionsService.sendMessageStream(
      req.session.userId as string,
      sessionId,
      body,
      res,
      req.requestId ?? '',
    );
  }
}
