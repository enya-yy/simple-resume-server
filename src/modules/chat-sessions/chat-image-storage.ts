import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { parseWorkerS3Env } from '../../config/s3-env';

export const CHAT_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export function chatImageExtensionForMime(mimeType: string): string | null {
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

export function isAcceptedChatImageMime(mimeType: string): boolean {
  return (CHAT_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function buildChatImageObjectKey(params: {
  userId: string;
  sessionId: string;
  stagingId: string;
  mimeType: string;
}): string {
  const ext = chatImageExtensionForMime(params.mimeType) ?? 'bin';
  return `chat-staging/${params.userId}/${params.sessionId}/${params.stagingId}.${ext}`;
}

function defaultLocalChatImageDir(): string {
  return join(process.cwd(), 'local-tmp', 'chat-images');
}

export async function storeChatStagedImage(params: {
  userId: string;
  sessionId: string;
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}): Promise<{ objectKey: string; stagingId: string }> {
  const stagingId = randomUUID();
  const objectKey = buildChatImageObjectKey({
    userId: params.userId,
    sessionId: params.sessionId,
    stagingId,
    mimeType: params.mimeType,
  });
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
    return { objectKey, stagingId };
  }

  const baseDir =
    process.env.CHAT_IMAGE_LOCAL_DIR?.trim() || defaultLocalChatImageDir();
  const localPath = join(baseDir, objectKey);
  await mkdir(dirname(localPath), { recursive: true });
  await writeFile(localPath, new Uint8Array(params.buffer));
  return { objectKey, stagingId };
}

export function resolveLocalChatImagePath(objectKey: string): string {
  const baseDir =
    process.env.CHAT_IMAGE_LOCAL_DIR?.trim() || defaultLocalChatImageDir();
  return join(baseDir, objectKey);
}

export function assertChatImageObjectKeyForSession(params: {
  userId: string;
  sessionId: string;
  objectKey: string;
}): boolean {
  const prefix = `chat-staging/${params.userId}/${params.sessionId}/`;
  return params.objectKey.startsWith(prefix);
}
