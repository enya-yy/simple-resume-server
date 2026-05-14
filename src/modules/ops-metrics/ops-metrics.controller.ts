import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { OpsMetricsTokenGuard } from './ops-metrics-token.guard';
import { OpsMetricsService } from './ops-metrics.service';
import { RequestIdLookupService } from './request-id-lookup.service';

@Controller('ops')
export class OpsMetricsController {
  constructor(
    private readonly opsMetricsService: OpsMetricsService,
    private readonly requestIdLookupService: RequestIdLookupService,
  ) {}

  @Get('metrics')
  @UseGuards(OpsMetricsTokenGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  getMetrics(
    @Req() req: Request,
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    return this.opsMetricsService.getMetrics(req, query);
  }

  @Get('request-id/:requestId')
  @UseGuards(OpsMetricsTokenGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  lookupByRequestId(@Param('requestId') requestId: string) {
    return this.requestIdLookupService.lookup(requestId);
  }
}
