import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { StreamableFile } from '@nestjs/common';
import {
  createResumeResponseSchema,
  duplicateResumeResponseSchema,
  ERROR_CODES,
  listResumesResponseSchema,
  loadResumeResponseSchema,
  patchResumeBodySchema,
  patchResumeResponseSchema,
  resumeDocumentSchema,
  uploadResumeAvatarResponseSchema,
  type ResumeDocument,
} from '../../contracts/index';
import { parseEnv } from '../../config/env.schema';
import { presignExportDownload } from '../export-jobs/export-artifact-presign';
import { ZodError } from 'zod';
import { extractResumeListPreview } from './resume-list-preview';
import {
  isAcceptedAvatarMime,
  resolveLocalAvatarPath,
  storeResumeAvatar,
} from './resume-avatar-storage';
import { resolveResumeAvatarUrl } from './resume-avatar-url';
import { ResumesRepository } from './resumes.repository';

@Injectable()
export class ResumesService {
  private readonly logger = new Logger(ResumesService.name);

  constructor(private readonly resumesRepository: ResumesRepository) {}

  async listResumes(userId: string) {
    const rows = await this.resumesRepository.listResumesForOwner(userId);
    return listResumesResponseSchema.parse({
      resumes: rows.map((row) => {
        const preview = extractResumeListPreview(row.document_json);
        return {
          resumeId: row.resume_id,
          title: row.title,
          updatedAt: row.updated_at.toISOString(),
          ...preview,
        };
      }),
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
        avatar: existingDoc.avatar,
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

  async uploadAvatar(
    userId: string,
    resumeId: string,
    file?: Express.Multer.File,
  ) {
    const env = parseEnv(process.env);
    if (!file?.buffer?.length) {
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: '请上传图片文件',
      });
    }
    if (file.size > env.AVATAR_MAX_FILE_BYTES) {
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: `图片过大，请控制在 ${Math.floor(env.AVATAR_MAX_FILE_BYTES / 1024 / 1024)}MB 以内`,
      });
    }
    const mime = file.mimetype?.trim() ?? '';
    if (!isAcceptedAvatarMime(mime)) {
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: '不支持的图片格式，请上传 JPG、PNG 或 WebP',
      });
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

    let existingDoc: ResumeDocument;
    try {
      existingDoc = resumeDocumentSchema.parse(
        existing.document_json,
      ) as ResumeDocument;
    } catch (e) {
      if (e instanceof ZodError) {
        throw new UnprocessableEntityException({
          code: ERROR_CODES.RESUME_DOCUMENT_INVALID,
          message: '当前简历数据格式异常，暂无法上传头像',
        });
      }
      throw e;
    }

    let stored: { objectKey: string };
    try {
      stored = await storeResumeAvatar({
        userId,
        resumeId,
        buffer: file.buffer,
        mimeType: mime,
      });
    } catch (err) {
      this.logger.error(
        `avatar storage failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: '头像保存失败，请稍后重试',
      });
    }

    const updatedAt = new Date().toISOString();
    const documentToSave: ResumeDocument = {
      ...existingDoc,
      avatar: {
        objectKey: stored.objectKey,
        updatedAt,
      },
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

    const avatarUrl = await resolveResumeAvatarUrl({
      resumeId,
      objectKey: stored.objectKey,
      updatedAt,
    });

    return uploadResumeAvatarResponseSchema.parse({
      avatarUrl,
      document: documentToSave,
    });
  }

  async deleteAvatar(userId: string, resumeId: string) {
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

    let existingDoc: ResumeDocument;
    try {
      existingDoc = resumeDocumentSchema.parse(
        existing.document_json,
      ) as ResumeDocument;
    } catch (e) {
      if (e instanceof ZodError) {
        throw new UnprocessableEntityException({
          code: ERROR_CODES.RESUME_DOCUMENT_INVALID,
          message: '当前简历数据格式异常',
        });
      }
      throw e;
    }

    if (!existingDoc.avatar) {
      return patchResumeResponseSchema.parse({
        resumeId: existing.id,
        title: existing.title,
        document: existingDoc,
        schemaVersion: existing.schema_version,
      });
    }

    const documentToSave: ResumeDocument = { ...existingDoc, avatar: undefined };
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

    return patchResumeResponseSchema.parse({
      resumeId: row.id,
      title: row.title,
      document: documentToSave,
      schemaVersion: row.schema_version,
    });
  }

  async streamAvatar(
    userId: string,
    resumeId: string,
  ): Promise<StreamableFile | { redirectUrl: string }> {
    const row = await this.resumesRepository.findByIdForOwner(resumeId, userId);
    if (!row) {
      throw new NotFoundException({
        code: ERROR_CODES.RESUME_NOT_FOUND,
        message: '简历不存在',
      });
    }

    let doc: ResumeDocument;
    try {
      doc = resumeDocumentSchema.parse(row.document_json) as ResumeDocument;
    } catch (e) {
      if (e instanceof ZodError) {
        throw new NotFoundException({
          code: ERROR_CODES.RESUME_NOT_FOUND,
          message: '头像不存在',
        });
      }
      throw e;
    }

    const avatar = doc.avatar;
    if (!avatar?.objectKey) {
      throw new NotFoundException({
        code: ERROR_CODES.RESUME_NOT_FOUND,
        message: '头像不存在',
      });
    }

    const env = parseEnv(process.env);
    const hasS3 =
      Boolean(env.S3_BUCKET) &&
      Boolean(env.S3_ACCESS_KEY_ID) &&
      Boolean(env.S3_SECRET_ACCESS_KEY);
    if (hasS3) {
      const presigned = await presignExportDownload(env, avatar.objectKey);
      if (presigned?.url) {
        return { redirectUrl: presigned.url };
      }
    }

    const filePath = resolveLocalAvatarPath(avatar.objectKey);
    try {
      await access(filePath);
    } catch {
      throw new NotFoundException({
        code: ERROR_CODES.RESUME_NOT_FOUND,
        message: '头像文件不存在',
      });
    }

    const stream = createReadStream(filePath);
    const ext = avatar.objectKey.split('.').pop()?.toLowerCase();
    const type =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/jpeg';
    return new StreamableFile(stream, {
      type,
      disposition: 'inline',
    });
  }
}
