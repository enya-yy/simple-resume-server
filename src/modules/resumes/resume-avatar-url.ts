import { parseEnv } from '../../config/env.schema';
import { presignExportDownload } from '../export-jobs/export-artifact-presign';

/** 供前端 img src 使用的同源或预签名 URL */
export async function resolveResumeAvatarUrl(params: {
  resumeId: string;
  objectKey: string;
  updatedAt: string;
}): Promise<string> {
  const env = parseEnv(process.env);
  const version = encodeURIComponent(params.updatedAt);
  const hasS3 =
    Boolean(env.S3_BUCKET) &&
    Boolean(env.S3_ACCESS_KEY_ID) &&
    Boolean(env.S3_SECRET_ACCESS_KEY);

  if (hasS3) {
    const presigned = await presignExportDownload(env, params.objectKey);
    if (presigned?.url) {
      return presigned.url;
    }
  }

  const origin =
    env.WEB_PUBLIC_ORIGIN ??
    env.CORS_ORIGINS.split(',')[0]?.trim() ??
    'http://localhost:5173';
  return `${origin}/api/resumes/${params.resumeId}/avatar?v=${version}`;
}
