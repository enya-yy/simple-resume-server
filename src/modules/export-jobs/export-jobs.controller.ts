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
import { ExportJobsService } from './export-jobs.service';

@Controller('export-jobs')
export class ExportJobsController {
  constructor(private readonly exportJobsService: ExportJobsService) {}

  @Post()
  @UseGuards(SessionAuthGuard, CsrfGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  create(@Req() req: Request, @Body() body: unknown) {
    return this.exportJobsService.createExportJob(
      req.session.userId as string,
      body,
      req.requestId,
    );
  }

  @Get(':jobId')
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  getOne(@Req() req: Request, @Param('jobId') jobId: string) {
    return this.exportJobsService.getExportJob(
      req.session.userId as string,
      jobId,
    );
  }
}
