import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import {
  ERROR_CODES,
  IMPORT_ALLOWED_MIME_TYPES,
  createImportJobResponseSchema,
  getImportJobResponseSchema,
  CREDIT_ACTIONS,
} from '../../contracts/index';
import { parseEnv } from '../../config/env.schema';
import { CreditsService } from '../credits/credits.service';
import { ChatMessagesRepository } from '../chat-sessions/chat-messages.repository';
import { ChatSessionsRepository } from '../chat-sessions/chat-sessions.repository';
import { ResumesRepository } from '../resumes/resumes.repository';
import { resolveUploadedOriginalName } from '../../common/utils/decode-upload-filename';
import { storeImportFile } from './import-file-storage';
import { ImportJobsRepository } from './import-jobs.repository';

const PASTE_MIN_CHARS = 20;
const PASTE_MAX_CHARS = 100_000;
const IMPORT_USER_MESSAGE_MAX_CHARS = 5000;

@Injectable()
export class ImportJobsService {
  private readonly logger = new Logger(ImportJobsService.name);

  constructor(
    private readonly importJobsRepository: ImportJobsRepository,
    private readonly resumesRepository: ResumesRepository,
    private readonly creditsService: CreditsService,
    private readonly chatSessionsRepository: ChatSessionsRepository,
    private readonly chatMessagesRepository: ChatMessagesRepository,
  ) {}

  async createImportJob(
    userId: string,
    params: {
      file?: Express.Multer.File;
      rawText?: string;
      sessionId?: string;
      userMessage?: string;
      fileName?: string;
    },
    requestId?: string,
  ) {
    const env = parseEnv(process.env);
    const hasFile = !!params.file;
    const trimmedText = params.rawText?.trim() ?? '';

    if (hasFile === !!trimmedText) {
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: '请上传文件或粘贴简历文本（二选一）',
      });
    }

    const recentCount = await this.importJobsRepository.countRecentForUser(
      userId,
      1,
    );
    if (recentCount >= env.IMPORT_RATE_LIMIT_PER_HOUR) {
      throw new HttpException(
        {
          code: ERROR_CODES.IMPORT_RATE_LIMITED,
          message: '导入过于频繁，请稍后再试',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (hasFile && params.file) {
      const file = params.file;
      if (file.size > env.IMPORT_MAX_FILE_BYTES) {
        throw new PayloadTooLargeException({
          code: ERROR_CODES.VALIDATION_FAILED,
          message: `文件过大，请控制在 ${Math.floor(env.IMPORT_MAX_FILE_BYTES / 1024 / 1024)}MB 以内`,
        });
      }
      const mime = file.mimetype?.trim() ?? '';
      if (
        !IMPORT_ALLOWED_MIME_TYPES.includes(
          mime as (typeof IMPORT_ALLOWED_MIME_TYPES)[number],
        )
      ) {
        throw new BadRequestException({
          code: ERROR_CODES.VALIDATION_FAILED,
          message: '不支持的文件格式，请上传 PDF、Word(.docx) 或图片',
        });
      }
    } else {
      if (trimmedText.length < PASTE_MIN_CHARS) {
        throw new BadRequestException({
          code: ERROR_CODES.VALIDATION_FAILED,
          message: `粘贴内容过短，请至少输入 ${PASTE_MIN_CHARS} 个字符`,
        });
      }
      if (trimmedText.length > PASTE_MAX_CHARS) {
        throw new BadRequestException({
          code: ERROR_CODES.VALIDATION_FAILED,
          message: '粘贴内容过长，请缩短后重试',
        });
      }
    }

    await this.creditsService.spend(userId, CREDIT_ACTIONS.IMPORT);

    let resumeId: string;
    let sessionId: string;

    if (params.sessionId) {
      const session = await this.chatSessionsRepository.findById(
        params.sessionId,
      );
      if (!session) {
        throw new NotFoundException({
          code: ERROR_CODES.CHAT_SESSION_NOT_FOUND,
          message: '会话不存在',
        });
      }
      if (session.user_id !== userId) {
        throw new ForbiddenException({
          code: ERROR_CODES.CHAT_SESSION_FORBIDDEN,
          message: '无权访问该会话',
        });
      }
      const existingImports =
        await this.importJobsRepository.countActiveOrSucceededForSession(
          params.sessionId,
        );
      if (existingImports > 0) {
        throw new ConflictException({
          code: ERROR_CODES.IMPORT_SESSION_ALREADY_USED,
          message: '该会话已上传过简历，不可重复导入',
        });
      }
      resumeId = session.resume_id;
      sessionId = session.id;
    } else {
      const created =
        await this.resumesRepository.createResumeWithDefaultDocument(userId);
      resumeId = created.resume_id;
      sessionId = created.session_id;
      if (!sessionId) {
        throw new Error('createResumeWithDefaultDocument missing session_id');
      }
    }

    const jobId = randomUUID();
    let sourceKind: 'file' | 'paste';
    let sourceMime: string | null = null;
    let sourceObjectKey: string | null = null;
    let sourceText: string | null = null;

    const displayFileName =
      hasFile && params.file
        ? resolveUploadedOriginalName(
            params.fileName,
            params.file.originalname,
          )
        : null;

    if (hasFile && params.file) {
      sourceKind = 'file';
      sourceMime = params.file.mimetype;
      try {
        const stored = await storeImportFile({
          userId,
          jobId,
          buffer: params.file.buffer,
          mimeType: params.file.mimetype,
          originalName: displayFileName ?? 'upload',
        });
        sourceObjectKey = stored.objectKey;
      } catch (err) {
        this.logger.error(
          `import file storage failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        throw new BadRequestException({
          code: ERROR_CODES.VALIDATION_FAILED,
          message: '文件保存失败，请稍后重试',
        });
      }
    } else {
      sourceKind = 'paste';
      sourceText = trimmedText;
    }

    const { id } = await this.importJobsRepository.insertQueued({
      id: jobId,
      userId,
      resumeId,
      sessionId,
      sourceKind,
      sourceMime,
      sourceObjectKey,
      sourceText,
      requestId,
    });

    if (hasFile && params.file) {
      const trimmedUserMessage = params.userMessage?.trim() ?? '';
      if (trimmedUserMessage.length > IMPORT_USER_MESSAGE_MAX_CHARS) {
        throw new BadRequestException({
          code: ERROR_CODES.VALIDATION_FAILED,
          message: `附带说明过长，请控制在 ${IMPORT_USER_MESSAGE_MAX_CHARS} 字以内`,
        });
      }
      await this.chatMessagesRepository.insertMessage({
        sessionId,
        role: 'user',
        contentType: 'text',
        contentJson: {
          type: 'text',
          role: 'user',
          text: trimmedUserMessage,
          attachments: [
            {
              name: displayFileName ?? '简历文件',
              mimeType: params.file.mimetype || undefined,
              kind: 'resume_import',
            },
          ],
        },
      });
    }

    return createImportJobResponseSchema.parse({
      jobId: id,
      resumeId,
      sessionId,
    });
  }

  async getImportJob(userId: string, jobId: string) {
    const row = await this.importJobsRepository.findById(jobId);
    if (!row) {
      throw new NotFoundException({
        code: ERROR_CODES.IMPORT_JOB_NOT_FOUND,
        message: '导入任务不存在',
      });
    }
    if (row.user_id !== userId) {
      throw new ForbiddenException({
        code: ERROR_CODES.AUTH_FORBIDDEN,
        message: '无权访问该导入任务',
      });
    }

    const payload = {
      jobId: row.id,
      status: row.status,
      resumeId: row.resume_id,
      sessionId:
        row.status === 'succeeded' ? row.session_id : undefined,
      errorCode: row.error_code ?? undefined,
      errorMessage: row.error_message ?? undefined,
    };

    return getImportJobResponseSchema.parse(payload);
  }
}
