/**
 * S3 兼容存储配置（API 预签名、Worker 上传、导入临时文件共用）。
 */
export type WorkerS3Env = {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

export function parseWorkerS3Env(): WorkerS3Env | null {
  const bucket = process.env.S3_BUCKET?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  if (!bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }
  const endpoint = process.env.S3_ENDPOINT?.trim() || undefined;
  const region = process.env.S3_REGION?.trim() || 'us-east-1';
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';
  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle,
  };
}
