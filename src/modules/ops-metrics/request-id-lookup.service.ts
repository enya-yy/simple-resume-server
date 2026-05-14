import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ERROR_CODES,
  type RequestIdLookupResponse,
  requestIdLookupRequestSchema,
} from '../../contracts/index';
import { RequestIdLookupRepository } from './request-id-lookup.repository';

@Injectable()
export class RequestIdLookupService {
  private readonly logger = new Logger(RequestIdLookupService.name);

  constructor(private readonly repo: RequestIdLookupRepository) {}

  async lookup(requestId: string): Promise<RequestIdLookupResponse> {
    const parsed = requestIdLookupRequestSchema.safeParse({ requestId });
    if (!parsed.success) {
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'requestId 必须是有效的 UUID',
      });
    }

    const normalized = parsed.data.requestId;
    this.logger.log(`request-id lookup requestId=${requestId}`);
    const rows = await this.repo.findJobsByRequestId(normalized);

    if (rows.length === 0) {
      throw new NotFoundException({
        code: ERROR_CODES.REQUEST_ID_NOT_FOUND,
        message: '请求 ID 未找到或已过期',
      });
    }

    const jobs = rows.map((r) => ({
      jobId: r.job_id,
      jobType: r.job_type,
      status: r.status,
      errorCode: r.error_code,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
      completedAt: r.completed_at ? r.completed_at.toISOString() : null,
    }));

    const occurredAt = jobs[0].createdAt;

    return {
      requestId: normalized,
      found: true as const,
      occurredAt,
      jobs,
    };
  }
}
