import { Module } from '@nestjs/common';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { CsrfService } from '../auth/csrf.service';
import { CreditsModule } from '../credits/credits.module';
import { PolishJobsModule } from '../polish-jobs/polish-jobs.module';
import { ResumesModule } from '../resumes/resumes.module';
import { ChatMessagesRepository } from './chat-messages.repository';
import { ChatSessionsController } from './chat-sessions.controller';
import { ChatSessionsRepository } from './chat-sessions.repository';
import { ChatSessionsService } from './chat-sessions.service';
import { ResumeAgentService } from '../resume-agent/resume-agent.service';
import { ResumeToolExecutorService } from '../resume-agent/resume-tool-executor.service';

@Module({
  imports: [ResumesModule, PolishJobsModule, CreditsModule],
  controllers: [ChatSessionsController],
  providers: [
    ChatSessionsService,
    ChatSessionsRepository,
    ChatMessagesRepository,
    CsrfService,
    CsrfGuard,
    ResumeAgentService,
    ResumeToolExecutorService,
  ],
  exports: [ChatSessionsRepository, ChatMessagesRepository],
})
export class ChatSessionsModule {}
