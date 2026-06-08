import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { parseEnv } from '../../config/env.schema';
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

  @Post(':sessionId/messages/image-choice')
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: parseEnv(process.env).AVATAR_MAX_FILE_BYTES,
      },
    }),
  )
  insertImageChoiceMessages(
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const text =
      typeof req.body?.text === 'string' ? req.body.text : undefined;
    return this.chatSessionsService.insertImageChoiceMessages(
      req.session.userId as string,
      sessionId,
      { file, text },
    );
  }

  @Post(':sessionId/messages/avatar-applied')
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  recordAvatarAppliedMessage(
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
  ) {
    return this.chatSessionsService.recordAvatarAppliedMessage(
      req.session.userId as string,
      sessionId,
    );
  }

  @Get(':sessionId/attachment-image')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  async streamAttachmentImage(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('sessionId') sessionId: string,
    @Query('objectKey') objectKey: string,
  ) {
    if (!objectKey?.trim()) {
      res.status(400);
      return { error: { message: '缺少 objectKey' } };
    }
    const result = await this.chatSessionsService.streamChatAttachmentImage(
      req.session.userId as string,
      sessionId,
      objectKey.trim(),
    );
    if ('redirectUrl' in result) {
      res.redirect(302, result.redirectUrl);
      return;
    }
    return result;
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
