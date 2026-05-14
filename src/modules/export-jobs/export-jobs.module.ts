import { Module } from '@nestjs/common';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { CsrfService } from '../auth/csrf.service';
import { ResumesModule } from '../resumes/resumes.module';
import { ExportJobsController } from './export-jobs.controller';
import { ExportJobsRepository } from './export-jobs.repository';
import { ExportJobsService } from './export-jobs.service';

@Module({
  imports: [ResumesModule],
  controllers: [ExportJobsController],
  providers: [ExportJobsService, ExportJobsRepository, CsrfService, CsrfGuard],
})
export class ExportJobsModule {}
