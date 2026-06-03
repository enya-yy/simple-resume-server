import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { parseEnv } from '../../config/env.schema';
import { ImportJobsService } from './import-jobs.service';

@Controller('import-jobs')
export class ImportJobsController {
  constructor(private readonly importJobsService: ImportJobsService) {}

  @Post()
  @UseGuards(SessionAuthGuard, CsrfGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: parseEnv(process.env).IMPORT_MAX_FILE_BYTES,
      },
    }),
  )
  create(
    @Req() req: Request,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const rawText =
      typeof req.body?.rawText === 'string' ? req.body.rawText : undefined;
    const sessionId =
      typeof req.body?.sessionId === 'string' && req.body.sessionId.trim()
        ? req.body.sessionId.trim()
        : undefined;
    const userMessage =
      typeof req.body?.userMessage === 'string'
        ? req.body.userMessage
        : undefined;
    const fileName =
      typeof req.body?.fileName === 'string' ? req.body.fileName : undefined;
    return this.importJobsService.createImportJob(
      req.session.userId as string,
      { file, rawText, sessionId, userMessage, fileName },
      req.requestId,
    );
  }

  @Get(':jobId')
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  getOne(@Req() req: Request, @Param('jobId') jobId: string) {
    return this.importJobsService.getImportJob(
      req.session.userId as string,
      jobId,
    );
  }
}
