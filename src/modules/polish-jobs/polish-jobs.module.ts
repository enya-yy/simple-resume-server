import { Module } from '@nestjs/common';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { CsrfService } from '../auth/csrf.service';
import { ResumesModule } from '../resumes/resumes.module';
import { PolishJobsController } from './polish-jobs.controller';
import { PolishJobsRepository } from './polish-jobs.repository';
import { PolishJobsService } from './polish-jobs.service';

@Module({
  imports: [ResumesModule],
  controllers: [PolishJobsController],
  providers: [PolishJobsService, PolishJobsRepository, CsrfService, CsrfGuard],
})
export class PolishJobsModule {}
