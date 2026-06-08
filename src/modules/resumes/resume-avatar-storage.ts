import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { parseEnv } from '../../config/env.schema';
import { parseWorkerS3Env } from '../../config/s3-env';

export const AVATAR_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AvatarMimeType = (typeof AVATAR_MIME_TYPES)[number];

export function avatarExtensionForMime(mimeType: string): string | null {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return null;
  }
}

export function isAcceptedAvatarMime(mimeType: string): mimeType is AvatarMimeType {
  return (AVATAR_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function buildResumeAvatarObjectKey(params: {
  userId: string;
  resumeId: string;
  mimeType: string;
}): string {
  const ext = avatarExtensionForMime(params.mimeType) ?? 'bin';
  return `avatars/${params.userId}/${params.resumeId}/avatar.${ext}`;
}

function defaultLocalAvatarDir(): string {
  return join(process.cwd(), 'local-tmp', 'avatars');
}

export async function storeResumeAvatar(params: {
  userId: string;
  resumeId: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<{ objectKey: string }> {
  const objectKey = buildResumeAvatarObjectKey(params);
  const s3Env = parseWorkerS3Env();

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
    await client.send(
      new PutObjectCommand({
        Bucket: s3Env.bucket,
        Key: objectKey,
        Body: params.buffer,
        ContentType: params.mimeType,
      }),
    );
    return { objectKey };
  }

  parseEnv(process.env);
  const baseDir =
    process.env.AVATAR_LOCAL_DIR?.trim() || defaultLocalAvatarDir();
  const localPath = join(baseDir, objectKey);
  await mkdir(dirname(localPath), { recursive: true });
  await writeFile(localPath, new Uint8Array(params.buffer));
  return { objectKey };
}

export function resolveLocalAvatarPath(objectKey: string): string {
  const baseDir =
    process.env.AVATAR_LOCAL_DIR?.trim() || defaultLocalAvatarDir();
  return join(baseDir, objectKey);
}
