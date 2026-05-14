import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { OpsMetricsService } from './ops-metrics.service';
import type { OpsMetricsRepository } from './ops-metrics.repository';

describe('OpsMetricsService', () => {
  const repo: Pick<
    OpsMetricsRepository,
    | 'aggregateExportStatusCounts'
    | 'aggregatePolishStatusCounts'
    | 'aggregateExportErrorCodes'
    | 'aggregatePolishErrorCodes'
  > = {
    aggregateExportStatusCounts: jest.fn().mockResolvedValue({}),
    aggregatePolishStatusCounts: jest.fn().mockResolvedValue({}),
    aggregateExportErrorCodes: jest.fn().mockResolvedValue([]),
    aggregatePolishErrorCodes: jest.fn().mockResolvedValue([]),
  };

  const req = { requestId: 'rid-1' } as Request;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns export aggregate for valid query', async () => {
    const svc = new OpsMetricsService(repo as OpsMetricsRepository);
    jest.spyOn(repo, 'aggregateExportStatusCounts').mockResolvedValue({
      succeeded: 2,
      failed: 1,
    });
    jest
      .spyOn(repo, 'aggregateExportErrorCodes')
      .mockResolvedValue([{ errorCode: 'E1', count: 1 }]);

    const res = await svc.getMetrics(req, {
      taskType: 'export',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-02T00:00:00.000Z',
    });

    expect(res.taskType).toBe('export');
    expect(res.terminalTotal).toBe(3);
    expect(res.successRate).toBeCloseTo(2 / 3);
    expect(res.failureRate).toBeCloseTo(1 / 3);
    expect(res.errorCodeCounts).toEqual([{ errorCode: 'E1', count: 1 }]);
  });

  it('throws on invalid query', async () => {
    const svc = new OpsMetricsService(repo as OpsMetricsRepository);
    await expect(
      svc.getMetrics(req, {
        taskType: 'export',
        from: 'not-a-date',
        to: '2026-01-02T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
