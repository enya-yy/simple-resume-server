import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { parseWorkerS3Env } from '../config/s3-env.js';

function resolveLocalAvatarPath(objectKey: string): string {
  const baseDir =
    process.env.AVATAR_LOCAL_DIR?.trim() || join(process.cwd(), 'local-tmp', 'avatars');
  return join(baseDir, objectKey);
}

function mimeFromObjectKey(objectKey: string): string {
  const ext = objectKey.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export async function loadResumeAvatarDataUrl(
  objectKey: string,
): Promise<string | null> {
  const s3Env = parseWorkerS3Env();
  let buffer: Buffer;

  if (s3Env) {
    const client = new S3Client({
      region: s3Env.region,
      ...(s3Env.endpoint ? { endpoint: s3Env.endpoint } : {}),
      forcePathStyle: s3Env.forcePathStyle,
      credentials: {
        accessKeyId: s3Env.accessKeyId,
        secretAccessKey: s3Env.secretAccessKey,
      },
    });
    try {
      const out = await client.send(
        new GetObjectCommand({
          Bucket: s3Env.bucket,
          Key: objectKey,
        }),
      );
      const bytes = await out.Body?.transformToByteArray();
      if (!bytes?.length) return null;
      buffer = Buffer.from(bytes);
    } catch {
      return null;
    }
  } else {
    try {
      buffer = readFileSync(resolveLocalAvatarPath(objectKey));
    } catch {
      return null;
    }
  }

  const mime = mimeFromObjectKey(objectKey);
  return `data:${mime};base64,${buffer.toString('base64')}`;
}
