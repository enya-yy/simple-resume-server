import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
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

  @Delete(':resumeId')
  @UseGuards(SessionAuthGuard, CsrfGuard)
  deleteResume(@Req() req: Request, @Param('resumeId') resumeId: string) {
    return this.resumesService.deleteResume(
      req.session.userId as string,
      resumeId,
    );
  }
}
