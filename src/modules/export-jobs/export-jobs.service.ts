import { createReadStream } from 'fs';
import { access } from 'fs/promises';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import {
  ERROR_CODES,
  createExportJobBodySchema,
  createExportJobResponseSchema,
  getExportJobResponseSchema,
} from '../../contracts/index';
import { ZodError } from 'zod';
import { parseEnv } from '../../config/env.schema';
import {
  isLocalExportStorageConfigured,
  localExportFilePath,
  resolveExportDownload,
  resolveLocalExportRootDir,
} from './export-artifact-download';
import { ResumesRepository } from '../resumes/resumes.repository';
import { ExportJobsRepository } from './export-jobs.repository';

@Injectable()
export class ExportJobsService {
  private readonly logger = new Logger(ExportJobsService.name);

  constructor(
    private readonly exportJobsRepository: ExportJobsRepository,
    private readonly resumesRepository: ResumesRepository,
  ) {}

  async createExportJob(userId: string, body: unknown, requestId?: string) {
    let parsed;
    try {
      parsed = createExportJobBodySchema.parse(body);
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

    const { id } = await this.exportJobsRepository.insertQueued({
      userId,
      resumeId: resume.id,
      status: 'queued',
      requestId,
    });

    return createExportJobResponseSchema.parse({ jobId: id });
  }

  async getExportJob(userId: string, jobId: string) {
    const row = await this.exportJobsRepository.findById(jobId);
    if (!row) {
      throw new NotFoundException({
        code: ERROR_CODES.EXPORT_JOB_NOT_FOUND,
        message: '导出任务不存在',
      });
    }
    if (row.user_id !== userId) {
      throw new ForbiddenException({
        code: ERROR_CODES.AUTH_FORBIDDEN,
        message: '无权访问该导出任务',
      });
    }
    const env = parseEnv(process.env);
    let downloadUrl: string | undefined;
    let downloadUrlExpiresInSeconds: number | undefined;
    if (row.status === 'succeeded' && row.artifact_object_key) {
      try {
        const signed = await resolveExportDownload(env, {
          jobId: row.id,
          objectKey: row.artifact_object_key,
        });
        if (signed) {
          downloadUrl = signed.url;
          downloadUrlExpiresInSeconds = signed.expiresInSeconds;
        }
      } catch (err) {
        this.logger.warn(
          `export presign failed for job ${row.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    const payload = {
      jobId: row.id,
      status: row.status,
      errorCode: row.error_code ?? undefined,
      errorMessage: row.error_message ?? undefined,
      downloadUrl,
      downloadUrlExpiresInSeconds,
    };
    const parsedRes = getExportJobResponseSchema.safeParse(payload);
    if (!parsedRes.success) {
      const detail = JSON.stringify(parsedRes.error.flatten());
      this.logger.error(
        `getExportJob response validation failed job=${jobId}: ${parsedRes.error.message}`,
      );
      this.logger.error(detail);
      throw new Error(`Export job response validation failed: ${detail}`);
    }
    return parsedRes.data;
  }

  async streamArtifact(
    userId: string,
    jobId: string,
  ): Promise<StreamableFile> {
    const env = parseEnv(process.env);
    if (!isLocalExportStorageConfigured(env)) {
      throw new NotFoundException({
        code: ERROR_CODES.EXPORT_JOB_NOT_FOUND,
        message: '导出产物不可用',
      });
    }
    const row = await this.exportJobsRepository.findById(jobId);
    if (!row) {
      throw new NotFoundException({
        code: ERROR_CODES.EXPORT_JOB_NOT_FOUND,
        message: '导出任务不存在',
      });
    }
    if (row.user_id !== userId) {
      throw new ForbiddenException({
        code: ERROR_CODES.AUTH_FORBIDDEN,
        message: '无权访问该导出任务',
      });
    }
    if (row.status !== 'succeeded' || !row.artifact_object_key) {
      throw new NotFoundException({
        code: ERROR_CODES.EXPORT_JOB_NOT_FOUND,
        message: '导出产物尚未就绪',
      });
    }
    const rootDir = resolveLocalExportRootDir(env);
    const filePath = localExportFilePath(rootDir, row.artifact_object_key);
    try {
      await access(filePath);
    } catch {
      throw new NotFoundException({
        code: ERROR_CODES.EXPORT_JOB_NOT_FOUND,
        message: '导出文件不存在，请重新导出',
      });
    }
    const stream = createReadStream(filePath);
    return new StreamableFile(stream, {
      type: row.artifact_content_type ?? 'application/pdf',
      disposition: `attachment; filename="resume-export-${jobId.slice(0, 8)}.pdf"`,
    });
  }
}
