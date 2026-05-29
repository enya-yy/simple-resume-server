import { Module } from '@nestjs/common';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { CsrfService } from '../auth/csrf.service';
import { CreditsModule } from '../credits/credits.module';
import { ResumesModule } from '../resumes/resumes.module';
import { ChatAssistJobsController } from './chat-assist-jobs.controller';
import { ChatAssistJobsRepository } from './chat-assist-jobs.repository';
import { ChatAssistJobsService } from './chat-assist-jobs.service';

@Module({
  imports: [ResumesModule, CreditsModule],
  controllers: [ChatAssistJobsController],
  providers: [
    ChatAssistJobsService,
    ChatAssistJobsRepository,
    CsrfService,
    CsrfGuard,
  ],
})
export class ChatAssistJobsModule {}
