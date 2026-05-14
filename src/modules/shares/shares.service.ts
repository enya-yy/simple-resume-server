import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import type { Request } from 'express';
import {
  ERROR_CODES,
  applySensitiveFieldPolicy,
  createShareBodySchema,
  createShareResponseSchema,
  getShareabilityChecklist,
  isResumeShareable,
  resumeDocumentSchema,
  resumeDocumentStrictSchema,
  resumeLayoutOptionsStrictSchema,
  shareReadOnlyResponseSchema,
  shareMetaResponseSchema,
  verifySharePasswordBodySchema,
  verifySharePasswordResponseSchema,
} from '../../contracts/index';
import type { ResumeDocument } from '../../contracts/index';
import { ZodError } from 'zod';
import { parseEnv } from '../../config/env.schema';
import { ResumesRepository } from '../resumes/resumes.repository';
import { SharesRepository } from './shares.repository';

/** Minimum lead time: expiration must be at least 5 minutes from now */
const MIN_EXPIRY_OFFSET_MS = 5 * 60 * 1_000;
/** Maximum allowed expiry: 1 year from creation */
const MAX_EXPIRY_OFFSET_MS = 365 * 24 * 60 * 60 * 1_000;

@Injectable()
export class SharesService {
  private readonly webPublicOrigin: string;
  private static readonly MAX_VERIFIED_SHARE_TOKENS = 100;

  constructor(
    private readonly sharesRepository: SharesRepository,
    private readonly resumesRepository: ResumesRepository,
  ) {
    const env = parseEnv(process.env);
    const fallbackOrigin = env.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .find((o) => o.length > 0);
    this.webPublicOrigin =
      env.WEB_PUBLIC_ORIGIN ?? fallbackOrigin ?? 'http://localhost:5173';
  }

  async createShare(userId: string | undefined, body: unknown) {
    if (!userId) {
      throw new ForbiddenException({
        code: ERROR_CODES.SHARE_CREATE_FORBIDDEN,
        message: '游客模式无法创建分享链接',
      });
    }

    let parsed;
    try {
      parsed = createShareBodySchema.parse(body);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new BadRequestException({
          code: ERROR_CODES.VALIDATION_FAILED,
          message: '请求参数无效',
        });
      }
      throw e;
    }

    let expiresAtDate: Date | undefined;
    if (parsed.expiresAt) {
      expiresAtDate = new Date(parsed.expiresAt);
      const now = Date.now();
      if (expiresAtDate.getTime() < now + MIN_EXPIRY_OFFSET_MS) {
        throw new BadRequestException({
          code: ERROR_CODES.VALIDATION_FAILED,
          message: '有效期必须晚于当前时间至少 5 分钟',
        });
      }
      if (expiresAtDate.getTime() > now + MAX_EXPIRY_OFFSET_MS) {
        throw new BadRequestException({
          code: ERROR_CODES.VALIDATION_FAILED,
          message: '有效期不可超过一年',
        });
      }
    }

    const resume = await this.resumesRepository.findByIdForOwner(
      parsed.resumeId,
      userId,
    );
    if (!resume) {
      throw new NotFoundException({
        code: ERROR_CODES.SHARE_RESUME_NOT_FOUND,
        message: '要分享的简历不存在',
      });
    }

    let resumeDocumentForGate: ResumeDocument;
    try {
      resumeDocumentForGate = resumeDocumentSchema.parse(
        resume.document_json,
      ) as ResumeDocument;
    } catch {
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: '简历数据无效，无法创建分享',
      });
    }
    if (!isResumeShareable(resumeDocumentForGate)) {
      throw new UnprocessableEntityException({
        code: ERROR_CODES.SHARE_NOT_READY,
        message: '简历尚未达到可分享标准，请先完善必填信息',
        details: {
          missingItems: getShareabilityChecklist(resumeDocumentForGate),
        },
      });
    }

    const rawToken = randomBytes(64).toString('base64url');
    const tokenHash = this.hashToken(rawToken);

    let passwordHash: string | undefined;
    if (parsed.password) {
      passwordHash = await argon2.hash(parsed.password, {
        type: argon2.argon2id,
      });
    }

    const created = await this.sharesRepository.insert({
      userId,
      resumeId: resume.id,
      tokenHash,
      passwordHash,
      expiresAt: expiresAtDate,
    });

    return createShareResponseSchema.parse({
      shareId: created.id,
      shareUrl: `${this.webPublicOrigin}/share/${rawToken}`,
      passwordEnabled: !!passwordHash,
      expirationEnabled: !!expiresAtDate,
      expiresAt: created.expiresAt ? created.expiresAt.toISOString() : null,
      createdAt: created.createdAt.toISOString(),
    });
  }

  async getShareMeta(shareToken: string) {
    const tokenHash = this.hashToken(shareToken);
    const meta = await this.sharesRepository.findMetaByTokenHash(tokenHash);
    if (!meta) {
      throw new NotFoundException({
        code: ERROR_CODES.SHARE_TOKEN_INVALID,
        message: '分享链接无效或已过期',
      });
    }
    this.assertNotExpired(meta.expires_at);
    return shareMetaResponseSchema.parse({
      passwordRequired: !!meta.password_hash,
      expiresAt: meta.expires_at ? meta.expires_at.toISOString() : null,
    });
  }

  async verifySharePassword(req: Request, shareToken: string, body: unknown) {
    let parsed;
    try {
      parsed = verifySharePasswordBodySchema.parse(body);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new BadRequestException({
          code: ERROR_CODES.VALIDATION_FAILED,
          message: '请求参数无效',
        });
      }
      throw e;
    }

    const tokenHash = this.hashToken(shareToken);
    const meta = await this.sharesRepository.findMetaByTokenHash(tokenHash);
    if (!meta) {
      throw new NotFoundException({
        code: ERROR_CODES.SHARE_TOKEN_INVALID,
        message: '分享链接无效或已过期',
      });
    }
    this.assertNotExpired(meta.expires_at);

    if (!meta.password_hash) {
      return verifySharePasswordResponseSchema.parse({ verified: true });
    }

    const ok = await argon2.verify(meta.password_hash, parsed.password);
    if (!ok) {
      throw new UnauthorizedException({
        code: ERROR_CODES.SHARE_PASSWORD_INVALID,
        message: '密码不正确，请重新输入',
      });
    }

    const verified = req.session.sharePasswordVerifiedTokenHashes ?? [];
    if (!verified.includes(tokenHash)) {
      const next = [...verified, tokenHash];
      req.session.sharePasswordVerifiedTokenHashes = next.slice(
        -SharesService.MAX_VERIFIED_SHARE_TOKENS,
      );
    }

    return verifySharePasswordResponseSchema.parse({ verified: true });
  }

  async getReadOnlyShare(req: Request, shareToken: string) {
    const tokenHash = this.hashToken(shareToken);
    const meta = await this.sharesRepository.findMetaByTokenHash(tokenHash);
    if (!meta) {
      throw new NotFoundException({
        code: ERROR_CODES.SHARE_TOKEN_INVALID,
        message: '分享链接无效或已过期',
      });
    }
    this.assertNotExpired(meta.expires_at);
    if (
      meta.password_hash &&
      !(req.session.sharePasswordVerifiedTokenHashes ?? []).includes(tokenHash)
    ) {
      throw new UnauthorizedException({
        code: ERROR_CODES.SHARE_PASSWORD_REQUIRED,
        message: '该分享需要先完成密码校验',
      });
    }

    const row = await this.sharesRepository.findReadOnlyByTokenHash(tokenHash);
    if (!row) {
      throw new NotFoundException({
        code: ERROR_CODES.SHARE_TOKEN_INVALID,
        message: '分享链接无效或已过期',
      });
    }

    let document: ResumeDocument;
    let layoutOptions: unknown;
    try {
      const parsedDocument = resumeDocumentStrictSchema.parse(
        row.document_json,
      ) as ResumeDocument;
      document = applySensitiveFieldPolicy(parsedDocument);
      layoutOptions = resumeLayoutOptionsStrictSchema.parse(row.layout_options);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new NotFoundException({
          code: ERROR_CODES.SHARE_NOT_FOUND,
          message: '分享内容不可用',
        });
      }
      throw e;
    }

    return shareReadOnlyResponseSchema.parse({
      document,
      templateId: document.templateId,
      layoutOptions,
    });
  }

  private assertNotExpired(expiresAt: Date | null): void {
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new GoneException({
        code: ERROR_CODES.SHARE_EXPIRED,
        message: '该分享链接已过期，无法访问',
      });
    }
  }

  private hashToken(rawToken: string) {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
