import { readFile } from 'node:fs/promises';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { resolveLocalImportPath } from '../../modules/import-jobs/import-file-storage';
import { parseWorkerS3Env } from '../config/s3-env';

export async function readImportFileBuffer(
  objectKey: string,
): Promise<Buffer> {
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
    const res = await client.send(
      new GetObjectCommand({ Bucket: s3Env.bucket, Key: objectKey }),
    );
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) {
      throw new Error('S3 object body empty');
    }
    return Buffer.from(bytes);
  }

  const localPath = resolveLocalImportPath(objectKey);
  return readFile(localPath);
}

export function isImageMime(mime: string | null | undefined): boolean {
  return (
    mime === 'image/jpeg' ||
    mime === 'image/png' ||
    mime === 'image/webp'
  );
}

export function isPdfMime(mime: string | null | undefined): boolean {
  return mime === 'application/pdf';
}

export function isDocxMime(mime: string | null | undefined): boolean {
  return (
    mime ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}

import { PDF_TEXT_MIN_CHARS, IMPORT_MAX_OCR_PAGES } from '../../common/llm/import/import-constants';
import { isPdfExtractedTextGarbled } from './pdf-text-quality';

export async function extractTextFromPdfBuffer(
  buffer: Buffer,
): Promise<{ text: string; needsVisionFallback: boolean }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (
    data: Buffer,
  ) => Promise<{ text: string }>;
  const result = await pdfParse(buffer);
  const text = (result.text ?? '').replace(/\s+/g, ' ').trim();
  const needsVisionFallback =
    text.length < PDF_TEXT_MIN_CHARS || isPdfExtractedTextGarbled(text);
  return {
    text,
    needsVisionFallback,
  };
}

export async function extractTextFromDocxBuffer(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return (result.value ?? '').replace(/\s+/g, ' ').trim();
}

/** 将 PDF 各页渲染为 PNG buffer（扫描版 fallback）。 */
export async function pdfBufferToPageImages(buffer: Buffer): Promise<Buffer[]> {
  const { pdf } = await import('pdf-to-img');
  const doc = await pdf(buffer, { scale: 2 });
  const pages: Buffer[] = [];
  for await (const page of doc) {
    pages.push(page);
    if (pages.length >= IMPORT_MAX_OCR_PAGES) break;
  }
  return pages;
}

export async function extractResumeText(params: {
  sourceKind: 'file' | 'paste';
  sourceMime: string | null;
  sourceObjectKey: string | null;
  sourceText: string | null;
  fileBuffer?: Buffer;
}): Promise<{ text: string; imageBuffers: Buffer[] }> {
  if (params.sourceKind === 'paste') {
    const text = (params.sourceText ?? '').trim();
    return { text, imageBuffers: [] };
  }

  const buffer =
    params.fileBuffer ??
    (params.sourceObjectKey
      ? await readImportFileBuffer(params.sourceObjectKey)
      : null);
  if (!buffer) {
    throw new Error('import file buffer missing');
  }

  const mime = params.sourceMime;

  if (isImageMime(mime)) {
    return { text: '', imageBuffers: [buffer] };
  }

  if (isDocxMime(mime)) {
    const text = await extractTextFromDocxBuffer(buffer);
    return { text, imageBuffers: [] };
  }

  if (isPdfMime(mime)) {
    const { text, needsVisionFallback } = await extractTextFromPdfBuffer(buffer);
    if (needsVisionFallback) {
      const imageBuffers = await pdfBufferToPageImages(buffer);
      return { text, imageBuffers };
    }
    return { text, imageBuffers: [] };
  }

  throw new Error(`unsupported mime: ${mime ?? 'unknown'}`);
}
