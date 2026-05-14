import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { EnvConfig } from '../../config/env.schema';

/**
 * 为已上传的导出产物签发短期 GET 预签名 URL；配置不全或关闭存储时返回 null。
 */
export async function presignExportDownload(
  env: EnvConfig,
  objectKey: string,
): Promise<{ url: string; expiresInSeconds: number } | null> {
  const ttl = env.S3_DOWNLOAD_URL_TTL_SECONDS;
  if (env.EXPORT_PRESIGN_STUB) {
    return {
      url: `https://stub.invalid/export-presign?k=${encodeURIComponent(
        objectKey,
      )}`,
      expiresInSeconds: ttl,
    };
  }
  if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    return null;
  }
  const client = new S3Client({
    region: env.S3_REGION,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
  const cmd = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: objectKey,
  });
  const url = await getSignedUrl(client, cmd, { expiresIn: ttl });
  return { url, expiresInSeconds: ttl };
}
