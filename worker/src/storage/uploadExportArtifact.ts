import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import type { WorkerS3Env } from "../config/s3-env.js";

export async function uploadExportPdf(
  env: WorkerS3Env,
  objectKey: string,
  body: Buffer,
): Promise<void> {
  const client = new S3Client({
    region: env.region,
    ...(env.endpoint ? { endpoint: env.endpoint } : {}),
    forcePathStyle: env.forcePathStyle,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: env.bucket,
      Key: objectKey,
      Body: body,
      ContentType: "application/pdf",
    }),
  );
}
