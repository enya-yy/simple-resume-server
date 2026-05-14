import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ERROR_CODES,
  createChatAssistJobBodySchema,
  createChatAssistJobResponseSchema,
  getChatAssistJobResponseSchema,
} from '../../contracts/index';
import { ZodError } from 'zod';
import { ResumesRepository } from '../resumes/resumes.repository';
import { ChatAssistJobsRepository } from './chat-assist-jobs.repository';

@Injectable()
export class ChatAssistJobsService {
  private readonly logger = new Logger(ChatAssistJobsService.name);

  constructor(
    private readonly chatAssistJobsRepository: ChatAssistJobsRepository,
    private readonly resumesRepository: ResumesRepository,
  ) {}

  async createChatAssistJob(userId: string, body: unknown) {
    let parsed;
    try {
      parsed = createChatAssistJobBodySchema.parse(body);
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

    const { id } = await this.chatAssistJobsRepository.insertQueued({
      userId,
      resumeId: resume.id,
      status: 'queued',
      assistKind: parsed.assistKind,
      targetHint: parsed.targetHint,
      contextHint: parsed.contextHint,
    });

    return createChatAssistJobResponseSchema.parse({ jobId: id });
  }

  async getChatAssistJob(userId: string, jobId: string) {
    const row = await this.chatAssistJobsRepository.findById(jobId);
    if (!row) {
      throw new NotFoundException({
        code: ERROR_CODES.CHAT_ASSIST_JOB_NOT_FOUND,
        message: '对话辅助任务不存在',
      });
    }
    if (row.user_id !== userId) {
      throw new ForbiddenException({
        code: ERROR_CODES.CHAT_ASSIST_JOB_FORBIDDEN,
        message: '无权访问该对话辅助任务',
      });
    }
    const payload = {
      jobId: row.id,
      status: row.status,
      suggestionText: row.suggestion_text ?? undefined,
      errorCode: row.error_code ?? undefined,
      errorMessage: row.error_message ?? undefined,
    };
    const parsedRes = getChatAssistJobResponseSchema.safeParse(payload);
    if (!parsedRes.success) {
      this.logger.error(
        `getChatAssistJob response validation failed job=${jobId}: ${parsedRes.error.message}`,
      );
      throw new Error('对话辅助任务响应格式异常');
    }
    return parsedRes.data;
  }
}
