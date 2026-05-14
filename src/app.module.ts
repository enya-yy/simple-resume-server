import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { ResumesModule } from './modules/resumes/resumes.module';
import { ExportJobsModule } from './modules/export-jobs/export-jobs.module';
import { PolishJobsModule } from './modules/polish-jobs/polish-jobs.module';
import { ChatAssistJobsModule } from './modules/chat-assist-jobs/chat-assist-jobs.module';
import { SharesModule } from './modules/shares/shares.module';
import { OpsMetricsModule } from './modules/ops-metrics/ops-metrics.module';
import { ChatSessionsModule } from './modules/chat-sessions/chat-sessions.module';
import { LlmGatewayModule } from './common/llm/llm-gateway.module';

@Module({
  imports: [
    DatabaseModule,
    LlmGatewayModule,
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 200 }],
    }),
    AuthModule,
    ResumesModule,
    ExportJobsModule,
    PolishJobsModule,
    ChatAssistJobsModule,
    SharesModule,
    OpsMetricsModule,
    ChatSessionsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
