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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { parseEnv } from '../../config/env.schema';
import { ResumesService } from './resumes.service';

@Controller('resumes')
export class ResumesController {
  constructor(private readonly resumesService: ResumesService) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  listResumes(@Req() req: Request) {
    return this.resumesService.listResumes(req.session.userId as string);
  }

  @Post()
  @UseGuards(SessionAuthGuard, CsrfGuard)
  createResume(@Req() req: Request) {
    return this.resumesService.createResume(req.session.userId as string);
  }

  @Get(':resumeId')
  @UseGuards(SessionAuthGuard)
  getResume(@Req() req: Request, @Param('resumeId') resumeId: string) {
    return this.resumesService.loadResume(
      req.session.userId as string,
      resumeId,
    );
  }

  @Patch(':resumeId')
  @UseGuards(SessionAuthGuard, CsrfGuard)
  patchResume(
    @Req() req: Request,
    @Param('resumeId') resumeId: string,
    @Body() body: unknown,
  ) {
    return this.resumesService.updateResume(
      req.session.userId as string,
      resumeId,
      body,
    );
  }

  @Post(':resumeId/duplicate')
  @UseGuards(SessionAuthGuard, CsrfGuard)
  duplicateResume(@Req() req: Request, @Param('resumeId') resumeId: string) {
    return this.resumesService.duplicateResume(
      req.session.userId as string,
      resumeId,
    );
  }

  @Post(':resumeId/avatar')
  @UseGuards(SessionAuthGuard, CsrfGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: parseEnv(process.env).AVATAR_MAX_FILE_BYTES,
      },
    }),
  )
  uploadAvatar(
    @Req() req: Request,
    @Param('resumeId') resumeId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.resumesService.uploadAvatar(
      req.session.userId as string,
      resumeId,
      file,
    );
  }

  @Delete(':resumeId/avatar')
  @UseGuards(SessionAuthGuard, CsrfGuard)
  deleteAvatar(@Req() req: Request, @Param('resumeId') resumeId: string) {
    return this.resumesService.deleteAvatar(
      req.session.userId as string,
      resumeId,
    );
  }

  @Get(':resumeId/avatar')
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  async getAvatar(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('resumeId') resumeId: string,
  ) {
    const result = await this.resumesService.streamAvatar(
      req.session.userId as string,
      resumeId,
    );
    if ('redirectUrl' in result) {
      res.redirect(302, result.redirectUrl);
      return;
    }
    return result;
  }

  @Delete(':resumeId')
  @UseGuards(SessionAuthGuard, CsrfGuard)
  deleteResume(@Req() req: Request, @Param('resumeId') resumeId: string) {
    return this.resumesService.deleteResume(
      req.session.userId as string,
      resumeId,
    );
  }
}
