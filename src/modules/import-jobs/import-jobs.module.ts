import { Module } from '@nestjs/common';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { CsrfService } from '../auth/csrf.service';
import { CreditsModule } from '../credits/credits.module';
import { ResumesModule } from '../resumes/resumes.module';
import { ImportJobsController } from './import-jobs.controller';
import { ImportJobsRepository } from './import-jobs.repository';
import { ImportJobsService } from './import-jobs.service';

@Module({
  imports: [ResumesModule, CreditsModule],
  controllers: [ImportJobsController],
  providers: [ImportJobsService, ImportJobsRepository, CsrfService, CsrfGuard],
})
export class ImportJobsModule {}
