import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { OpsMetricsController } from './ops-metrics.controller';
import { OpsMetricsRepository } from './ops-metrics.repository';
import { OpsMetricsService } from './ops-metrics.service';
import { OpsMetricsTokenGuard } from './ops-metrics-token.guard';
import { RequestIdLookupRepository } from './request-id-lookup.repository';
import { RequestIdLookupService } from './request-id-lookup.service';

@Module({
  imports: [DatabaseModule],
  controllers: [OpsMetricsController],
  providers: [
    OpsMetricsRepository,
    OpsMetricsService,
    OpsMetricsTokenGuard,
    RequestIdLookupRepository,
    RequestIdLookupService,
  ],
})
export class OpsMetricsModule {}
