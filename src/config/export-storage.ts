import { isAbsolute, join, normalize, resolve, sep } from 'path';

import { parseWorkerS3Env, type WorkerS3Env } from './s3-env';

export type ExportStorageTarget =
  | { kind: 's3'; env: WorkerS3Env }
  | { kind: 'local'; rootDir: string };

/** 将 EXPORT_LOCAL_DIR 解析为绝对路径（相对路径相对 monorepo 根目录）。 */
export function resolveExportLocalDir(
  raw: string,
  monorepoRoot: string,
): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('EXPORT_LOCAL_DIR is empty');
  }
  return isAbsolute(trimmed) ? trimmed : resolve(monorepoRoot, trimmed);
}

export function monorepoRootFromModuleDir(moduleDirname: string): string {
  return join(moduleDirname, '../../..');
}

/** Worker / API：优先 S3；否则使用 EXPORT_LOCAL_DIR 本地目录。 */
export function parseExportStorageTarget(
  monorepoRoot: string,
): ExportStorageTarget | null {
  const s3 = parseWorkerS3Env();
  if (s3) {
    return { kind: 's3', env: s3 };
  }
  const localRaw = process.env.EXPORT_LOCAL_DIR?.trim();
  if (localRaw) {
    return {
      kind: 'local',
      rootDir: resolveExportLocalDir(localRaw, monorepoRoot),
    };
  }
  return null;
}

export function localExportFilePath(
  rootDir: string,
  objectKey: string,
): string {
  const safeKey = objectKey.replace(/^\/+/, '');
  if (safeKey.includes('..')) {
    throw new Error('invalid export object key');
  }
  const filePath = join(rootDir, safeKey);
  const normalized = normalize(filePath);
  const normalizedRoot = normalize(rootDir);
  if (
    normalized !== normalizedRoot &&
    !normalized.startsWith(`${normalizedRoot}${sep}`)
  ) {
    throw new Error('export object key escapes local root');
  }
  return normalized;
}
