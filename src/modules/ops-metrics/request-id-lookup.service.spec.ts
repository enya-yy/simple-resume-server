import { NotFoundException } from '@nestjs/common';
import { RequestIdLookupService } from './request-id-lookup.service';
import type {
  RequestIdLookupRepository,
  JobDiagnosticRow,
} from './request-id-lookup.repository';

describe('RequestIdLookupService', () => {
  const repo: Pick<RequestIdLookupRepository, 'findJobsByRequestId'> = {
    findJobsByRequestId: jest.fn().mockResolvedValue([]),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws REQUEST_ID_NOT_FOUND when no jobs match', async () => {
    const svc = new RequestIdLookupService(repo as RequestIdLookupRepository);
    jest.spyOn(repo, 'findJobsByRequestId').mockResolvedValue([]);

    await expect(
      svc.lookup('550e8400-e29b-41d4-a716-446655440000'),
    ).rejects.toBeInstanceOf(NotFoundException);

    try {
      await svc.lookup('550e8400-e29b-41d4-a716-446655440000');
    } catch (e) {
      const response = (e as NotFoundException).getResponse() as {
        code: string;
      };
      expect(response.code).toBe('REQUEST_ID_NOT_FOUND');
    }
  });

  it('returns found result with job diagnostics', async () => {
    const svc = new RequestIdLookupService(repo as RequestIdLookupRepository);
    const now = new Date('2026-04-01T12:00:00.000Z');
    const later = new Date('2026-04-01T12:01:00.000Z');

    const rows: JobDiagnosticRow[] = [
      {
        job_id: '660e8400-e29b-41d4-a716-446655440001',
        job_type: 'export',
        status: 'failed',
        error_code: 'E_TEST',
        created_at: now,
        updated_at: later,
        completed_at: later,
      },
    ];
    jest.spyOn(repo, 'findJobsByRequestId').mockResolvedValue(rows);

    const result = await svc.lookup('550e8400-e29b-41d4-a716-446655440000');

    expect(result.found).toBe(true);
    expect(result.requestId).toBe('550e8400-e29b-41d4-a716-446655440000');
    if (result.found) {
      expect(result.occurredAt).toBe('2026-04-01T12:00:00.000Z');
      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].jobId).toBe('660e8400-e29b-41d4-a716-446655440001');
      expect(result.jobs[0].jobType).toBe('export');
      expect(result.jobs[0].status).toBe('failed');
      expect(result.jobs[0].errorCode).toBe('E_TEST');
    }
  });

  it('returns multiple jobs for the same requestId', async () => {
    const svc = new RequestIdLookupService(repo as RequestIdLookupRepository);
    const t1 = new Date('2026-04-01T12:00:00.000Z');
    const t2 = new Date('2026-04-01T12:02:00.000Z');

    const rows: JobDiagnosticRow[] = [
      {
        job_id: 'aaa00000-0000-0000-0000-000000000001',
        job_type: 'export',
        status: 'succeeded',
        error_code: null,
        created_at: t1,
        updated_at: t1,
        completed_at: t1,
      },
      {
        job_id: 'bbb00000-0000-0000-0000-000000000002',
        job_type: 'polish',
        status: 'failed',
        error_code: 'POLISH_LLM_TIMEOUT',
        created_at: t2,
        updated_at: t2,
        completed_at: t2,
      },
    ];
    jest.spyOn(repo, 'findJobsByRequestId').mockResolvedValue(rows);

    const result = await svc.lookup('550e8400-e29b-41d4-a716-446655440000');

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.jobs).toHaveLength(2);
      expect(result.jobs[0].jobType).toBe('export');
      expect(result.jobs[1].jobType).toBe('polish');
      expect(result.jobs[1].errorCode).toBe('POLISH_LLM_TIMEOUT');
    }
  });
});
