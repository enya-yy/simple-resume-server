import type { EnvConfig } from '../../config/env.schema';
import {
  localExportFilePath,
  monorepoRootFromModuleDir,
  resolveExportLocalDir,
} from '../../config/export-storage';

export { localExportFilePath };
import { presignExportDownload } from './export-artifact-presign';

export function isLocalExportStorageConfigured(env: EnvConfig): boolean {
  return Boolean(env.EXPORT_LOCAL_DIR?.trim());
}

export function resolveLocalExportRootDir(env: EnvConfig): string {
  const raw = env.EXPORT_LOCAL_DIR?.trim();
  if (!raw) {
    throw new Error('EXPORT_LOCAL_DIR is not configured');
  }
  return resolveExportLocalDir(raw, monorepoRootFromModuleDir(__dirname));
}

/**
 * succeeded 任务的下载链接：S3 预签名；本地目录则走同源 API artifact 端点。
 */
export async function resolveExportDownload(
  env: EnvConfig,
  params: { jobId: string; objectKey: string },
): Promise<{ url: string; expiresInSeconds: number } | null> {
  const ttl = env.S3_DOWNLOAD_URL_TTL_SECONDS;
  const hasS3 =
    Boolean(env.S3_BUCKET) &&
    Boolean(env.S3_ACCESS_KEY_ID) &&
    Boolean(env.S3_SECRET_ACCESS_KEY);
  if (hasS3) {
    return presignExportDownload(env, params.objectKey);
  }
  if (isLocalExportStorageConfigured(env)) {
    const origin =
      env.WEB_PUBLIC_ORIGIN ??
      env.CORS_ORIGINS.split(',')[0]?.trim() ??
      'http://localhost:5173';
    return {
      url: `${origin}/api/export-jobs/${params.jobId}/artifact`,
      expiresInSeconds: ttl,
    };
  }
  return null;
}
