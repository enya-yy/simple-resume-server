import { Module } from '@nestjs/common';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { CsrfService } from '../auth/csrf.service';
import { ResumesModule } from '../resumes/resumes.module';
import { ChatMessagesRepository } from './chat-messages.repository';
import { ChatSessionsController } from './chat-sessions.controller';
import { ChatSessionsRepository } from './chat-sessions.repository';
import { ChatSessionsService } from './chat-sessions.service';
import { IntentDispatcherService } from './intent-dispatcher.service';

@Module({
  imports: [ResumesModule],
  controllers: [ChatSessionsController],
  providers: [
    ChatSessionsService,
    ChatSessionsRepository,
    ChatMessagesRepository,
    CsrfService,
    CsrfGuard,
    IntentDispatcherService,
  ],
  exports: [ChatSessionsRepository, ChatMessagesRepository],
})
export class ChatSessionsModule {}
