import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ERROR_CODES,
  createPolishJobBodySchema,
  createPolishJobResponseSchema,
  extractPolishTargetText,
  getPolishJobResponseSchema,
  resumeDocumentSchema,
} from '../../contracts/index';
import { ZodError } from 'zod';
import { ResumesRepository } from '../resumes/resumes.repository';
import { PolishJobsRepository } from './polish-jobs.repository';

@Injectable()
export class PolishJobsService {
  private readonly logger = new Logger(PolishJobsService.name);

  constructor(
    private readonly polishJobsRepository: PolishJobsRepository,
    private readonly resumesRepository: ResumesRepository,
  ) {}

  async createPolishJob(userId: string, body: unknown, requestId?: string) {
    let parsed;
    try {
      parsed = createPolishJobBodySchema.parse(body);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new BadRequestException({
          code: ERROR_CODES.VALIDATION_FAILED,
          message: '请求参数无效',
        });
      }
      throw e;
    }

    const resume = await this.resumesRepository.findByIdForOwner(
      parsed.resumeId,
      userId,
    );
    if (!resume) {
      throw new NotFoundException({
        code: ERROR_CODES.RESUME_NOT_FOUND,
        message: '简历不存在',
      });
    }

    let doc;
    try {
      doc = resumeDocumentSchema.parse(resume.document_json);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new BadRequestException({
          code: ERROR_CODES.VALIDATION_FAILED,
          message: '简历文档格式无效',
        });
      }
      throw e;
    }

    const extracted = extractPolishTargetText(doc, parsed.target);
    if (extracted === null) {
      throw new BadRequestException({
        code: ERROR_CODES.POLISH_REQUEST_INVALID_TARGET,
        message: '润色目标无效或无可提取文本',
      });
    }

    const { id } = await this.polishJobsRepository.insertQueued({
      userId,
      resumeId: resume.id,
      status: 'queued',
      moduleId: parsed.target.moduleId,
      itemId: parsed.target.itemId,
      bulletIndex: parsed.target.bulletIndex,
      requestId,
    });

    return createPolishJobResponseSchema.parse({ jobId: id });
  }

  async getPolishJob(userId: string, jobId: string) {
    const row = await this.polishJobsRepository.findById(jobId);
    if (!row) {
      throw new NotFoundException({
        code: ERROR_CODES.POLISH_JOB_NOT_FOUND,
        message: '润色任务不存在',
      });
    }
    if (row.user_id !== userId) {
      throw new ForbiddenException({
        code: ERROR_CODES.POLISH_JOB_FORBIDDEN,
        message: '无权访问该润色任务',
      });
    }
    const payload = {
      jobId: row.id,
      status: row.status,
      originalText: row.original_text ?? undefined,
      polishedText: row.polished_text ?? undefined,
      errorCode: row.error_code ?? undefined,
      errorMessage: row.error_message ?? undefined,
    };
    const parsedRes = getPolishJobResponseSchema.safeParse(payload);
    if (!parsedRes.success) {
      this.logger.error(
        `getPolishJob response validation failed job=${jobId}: ${parsedRes.error.message}`,
      );
      throw new Error('润色任务响应格式异常');
    }
    return parsedRes.data;
  }
}
