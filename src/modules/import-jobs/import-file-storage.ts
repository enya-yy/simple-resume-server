import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { parseEnv } from '../../config/env.schema';
import { parseWorkerS3Env } from '../../config/s3-env';

export function buildImportObjectKey(params: {
  userId: string;
  jobId: string;
  originalName: string;
}): string {
  const safeName = params.originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  return `imports/${params.userId}/${params.jobId}/${safeName}`;
}

function defaultLocalImportDir(): string {
  return join(process.cwd(), 'local-tmp', 'imports');
}

export async function storeImportFile(params: {
  userId: string;
  jobId: string;
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}): Promise<{ objectKey: string }> {
  const objectKey = buildImportObjectKey(params);
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

  const env = parseEnv(process.env);
  const baseDir =
    process.env.IMPORT_LOCAL_DIR?.trim() || defaultLocalImportDir();
  const localPath = join(baseDir, objectKey);
  await mkdir(dirname(localPath), { recursive: true });
  await writeFile(localPath, new Uint8Array(params.buffer));
  return { objectKey };
}

export function resolveLocalImportPath(objectKey: string): string {
  const baseDir =
    process.env.IMPORT_LOCAL_DIR?.trim() || defaultLocalImportDir();
  return join(baseDir, objectKey);
}
