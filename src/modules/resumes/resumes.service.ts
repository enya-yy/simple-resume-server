import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  createResumeResponseSchema,
  duplicateResumeResponseSchema,
  ERROR_CODES,
  listResumesResponseSchema,
  loadResumeResponseSchema,
  patchResumeBodySchema,
  patchResumeResponseSchema,
  resumeDocumentSchema,
  type ResumeDocument,
} from '../../contracts/index';
import { ZodError } from 'zod';
import { ResumesRepository } from './resumes.repository';

@Injectable()
export class ResumesService {
  private readonly logger = new Logger(ResumesService.name);

  constructor(private readonly resumesRepository: ResumesRepository) {}

  async listResumes(userId: string) {
    const rows = await this.resumesRepository.listResumesForOwner(userId);
    return listResumesResponseSchema.parse({
      resumes: rows.map((row) => ({
        resumeId: row.resume_id,
        title: row.title,
        updatedAt: row.updated_at.toISOString(),
      })),
    });
  }

  async createResume(userId: string) {
    const created =
      await this.resumesRepository.createResumeWithDefaultDocument(userId);
    try {
      return createResumeResponseSchema.parse({
        resumeId: created.resume_id,
        sessionId: created.session_id,
        document: created.document_json,
      });
    } catch (e) {
      if (e instanceof ZodError) {
        this.logger.error({
          msg: 'resume_create_response_invalid',
          userId,
          issues: e.flatten(),
        });
        throw new UnprocessableEntityException({
          code: ERROR_CODES.RESUME_DOCUMENT_INVALID,
          message:
            '新建简历响应格式异常。请稍后重试或联系支持，并附上 requestId。',
        });
      }
      throw e;
    }
  }

  async loadResume(userId: string, resumeId: string) {
    const row = await this.resumesRepository.findByIdForOwner(resumeId, userId);
    if (!row) {
      throw new NotFoundException({
        code: ERROR_CODES.RESUME_NOT_FOUND,
        message: '简历不存在',
      });
    }
    try {
      return loadResumeResponseSchema.parse({
        resumeId: row.id,
        title: row.title,
        document: row.document_json,
        schemaVersion: row.schema_version,
      });
    } catch (e) {
      if (e instanceof ZodError) {
        this.logger.error({
          msg: 'resume_load_document_invalid',
          resumeId: row.id,
          userId,
          issues: e.flatten(),
        });
        throw new UnprocessableEntityException({
          code: ERROR_CODES.RESUME_DOCUMENT_INVALID,
          message:
            '简历内容格式异常，无法加载。请稍后重试或联系支持，并附上 requestId。',
        });
      }
      throw e;
    }
  }

  async updateResume(userId: string, resumeId: string, body: unknown) {
    let parsed;
    try {
      parsed = patchResumeBodySchema.parse(body);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new BadRequestException({
          code: ERROR_CODES.VALIDATION_FAILED,
          message: '请求参数无效',
        });
      }
      throw e;
    }

    const existing = await this.resumesRepository.findByIdForOwner(
      resumeId,
      userId,
    );
    if (!existing) {
      throw new NotFoundException({
        code: ERROR_CODES.RESUME_NOT_FOUND,
        message: '简历不存在',
      });
    }

    let updated = existing;

    if (parsed.document !== undefined) {
      let existingDoc;
      try {
        existingDoc = resumeDocumentSchema.parse(existing.document_json);
      } catch (e) {
        if (e instanceof ZodError) {
          this.logger.error({
            msg: 'resume_patch_existing_document_invalid',
            resumeId,
            userId,
            issues: e.flatten(),
          });
          throw new UnprocessableEntityException({
            code: ERROR_CODES.RESUME_DOCUMENT_INVALID,
            message:
              '当前简历数据格式异常，暂无法保存修改。请联系支持并附上 requestId。',
          });
        }
        throw e;
      }
      const mergedBasicsSensitive =
        parsed.document.basicsSensitive !== undefined
          ? {
              ...(existingDoc.basicsSensitive ?? {}),
              ...parsed.document.basicsSensitive,
            }
          : existingDoc.basicsSensitive;
      const documentToSave = {
        ...parsed.document,
        layoutOptions:
          parsed.document.layoutOptions ?? existingDoc.layoutOptions,
        basicsSensitive: mergedBasicsSensitive,
      };

      const row = await this.resumesRepository.updateDocumentForOwner(
        resumeId,
        userId,
        documentToSave,
      );
      if (!row) {
        throw new NotFoundException({
          code: ERROR_CODES.RESUME_NOT_FOUND,
          message: '简历不存在',
        });
      }
      updated = row;

      try {
        const savedDoc = resumeDocumentSchema.parse(
          documentToSave,
        ) as ResumeDocument;
        await this.resumesRepository.applyAutoTitleFromBasicsIfUnlocked(
          resumeId,
          userId,
          savedDoc,
        );
        const refreshed = await this.resumesRepository.findByIdForOwner(
          resumeId,
          userId,
        );
        if (refreshed) {
          updated = refreshed;
        }
      } catch (e) {
        if (e instanceof ZodError) {
          this.logger.warn({
            msg: 'resume_auto_title_skipped_invalid_doc',
            resumeId,
            userId,
          });
        } else {
          throw e;
        }
      }
    }

    if (parsed.title !== undefined) {
      const lock = parsed.lockTitle ?? true;
      const row = await this.resumesRepository.setTitleForOwner(
        resumeId,
        userId,
        parsed.title,
        lock,
      );
      if (!row) {
        throw new NotFoundException({
          code: ERROR_CODES.RESUME_NOT_FOUND,
          message: '简历不存在',
        });
      }
      updated = row;
    }

    try {
      return patchResumeResponseSchema.parse({
        resumeId: updated.id,
        title: updated.title,
        document: updated.document_json,
        schemaVersion: updated.schema_version,
      });
    } catch (e) {
      if (e instanceof ZodError) {
        this.logger.error({
          msg: 'resume_patch_response_document_invalid',
          resumeId: updated.id,
          userId,
          issues: e.flatten(),
        });
        throw new UnprocessableEntityException({
          code: ERROR_CODES.RESUME_DOCUMENT_INVALID,
          message: '保存后的简历格式校验失败。请联系支持并附上 requestId。',
        });
      }
      throw e;
    }
  }

  async duplicateResume(userId: string, sourceResumeId: string) {
    const result = await this.resumesRepository.duplicateResumeForOwner(
      userId,
      sourceResumeId,
    );
    if (result.ok === false) {
      if (result.error === 'RESUME_NOT_FOUND') {
        throw new NotFoundException({
          code: ERROR_CODES.RESUME_NOT_FOUND,
          message: '简历不存在',
        });
      }
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: '简历内容无效或已损坏',
      });
    }
    try {
      return duplicateResumeResponseSchema.parse({
        resumeId: result.data.resumeId,
        sessionId: result.data.sessionId,
        document: result.data.documentJson,
      });
    } catch (e) {
      if (e instanceof ZodError) {
        this.logger.error({
          msg: 'resume_duplicate_response_invalid',
          sourceResumeId,
          userId,
          issues: e.flatten(),
        });
        throw new UnprocessableEntityException({
          code: ERROR_CODES.RESUME_DOCUMENT_INVALID,
          message: '复制后的简历格式异常。请联系支持并附上 requestId。',
        });
      }
      throw e;
    }
  }

  async deleteResume(userId: string, resumeId: string) {
    const deleted = await this.resumesRepository.deleteByIdForUser(
      resumeId,
      userId,
    );
    if (!deleted) {
      throw new NotFoundException({
        code: ERROR_CODES.RESUME_NOT_FOUND,
        message: '简历不存在',
      });
    }
  }
}
