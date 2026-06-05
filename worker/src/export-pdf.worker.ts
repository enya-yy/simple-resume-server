import {
  EXPORT_JOB_ERROR_CODES,
  resumeDocumentSchema,
  applySensitiveFieldPolicy,
} from "./contracts/index.js";
import type { PgLikePool } from "@simple-resume/sqlite-pg";
import { ZodError } from "zod";

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  monorepoRootFromModuleDir,
  parseExportStorageTarget,
} from "./config/export-storage.js";
import { buildResumeExportParts } from "./render/buildResumeExportHtml.js";
import { renderResumeExportPartsToPdf } from "./render/renderPdf.js";
import { saveExportPdf } from "./storage/saveExportArtifact.js";

const MSG_RENDER =
  "PDF 生成失败，请稍后重试。若问题持续，请联系支持并附上 requestId。";
const MSG_STORAGE =
  "导出文件上传失败或未配置对象存储，请检查环境后重试。若问题持续，请联系支持并附上 requestId。";

function buildArtifactObjectKey(params: {
  userId: string;
  resumeId: string;
  exportJobId: string;
}): string {
  return `users/${params.userId}/resumes/${params.resumeId}/exports/${params.exportJobId}.pdf`;
}

async function markExportFailed(
  pool: PgLikePool,
  exportJobId: string,
  code: string,
  message: string,
): Promise<void> {
  await pool.query(
    `UPDATE export_jobs
        SET status = 'failed',
            error_code = $2,
            error_message = $3,
            updated_at = now()
      WHERE id = $1 AND status = 'running'`,
    [exportJobId, code, message],
  );
}

/**
 * Story 4.2：queued → running → 渲染 PDF（与 ResumePreview 语义对齐）→ 上传 S3 → succeeded + 产物元数据。
 */
export async function runExportJobStep(
  pool: PgLikePool,
  exportJobId: string,
): Promise<void> {
  try {
    const r1 = await pool.query(
      `UPDATE export_jobs SET status = 'running', updated_at = now()
     WHERE id = $1 AND status = 'queued'`,
      [exportJobId],
    );
    if (r1.rowCount === 0) {
      console.warn(
        "[worker] export job skipped (not queued or already claimed)",
        exportJobId,
      );
      return;
    }

    const storage = parseExportStorageTarget(
      monorepoRootFromModuleDir(dirname(fileURLToPath(import.meta.url))),
    );
    if (!storage) {
      await markExportFailed(
        pool,
        exportJobId,
        EXPORT_JOB_ERROR_CODES.EXPORT_STORAGE_FAILED,
        MSG_STORAGE,
      );
      return;
    }

    const jobRow = await pool.query<{
      user_id: string;
      resume_id: string;
      document_json: unknown;
    }>(
      `SELECT ej.user_id, ej.resume_id, r.document_json
       FROM export_jobs ej
       INNER JOIN resumes r ON r.id = ej.resume_id
      WHERE ej.id = $1 AND ej.status = 'running'`,
      [exportJobId],
    );
    const row = jobRow.rows[0];
    if (!row) {
      await markExportFailed(
        pool,
        exportJobId,
        EXPORT_JOB_ERROR_CODES.EXPORT_JOB_FAILED,
        MSG_RENDER,
      );
      return;
    }

    let parsed;
    try {
      parsed = resumeDocumentSchema.parse(row.document_json);
    } catch (e) {
      if (e instanceof ZodError) {
        console.error(
          "[worker] document_json invalid",
          exportJobId,
          e.flatten(),
        );
      }
      await markExportFailed(
        pool,
        exportJobId,
        EXPORT_JOB_ERROR_CODES.EXPORT_RENDER_FAILED,
        MSG_RENDER,
      );
      return;
    }

    const objectKey = buildArtifactObjectKey({
      userId: row.user_id,
      resumeId: row.resume_id,
      exportJobId,
    });

    try {
      const masked = applySensitiveFieldPolicy(parsed, { mask: false });
      const parts = buildResumeExportParts(masked);
      const pdf = await renderResumeExportPartsToPdf(parts);
      try {
        await saveExportPdf(storage, objectKey, pdf);
      } catch (uploadErr) {
        const detail =
          uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
        console.error("[worker] export artifact save failed", exportJobId, detail);
        await markExportFailed(
          pool,
          exportJobId,
          EXPORT_JOB_ERROR_CODES.EXPORT_STORAGE_FAILED,
          MSG_STORAGE,
        );
        return;
      }
      const sizeBytes = pdf.length;
      await pool.query(
        `UPDATE export_jobs SET
          status = 'succeeded',
          artifact_object_key = $2,
          artifact_content_type = 'application/pdf',
          artifact_size_bytes = $3,
          completed_at = now(),
          updated_at = now()
        WHERE id = $1 AND status = 'running'`,
        [exportJobId, objectKey, sizeBytes],
      );
    } catch (e) {
      const detail = e instanceof Error ? e.stack ?? e.message : String(e);
      console.error("[worker] PDF render failed", exportJobId, detail);
      await markExportFailed(
        pool,
        exportJobId,
        EXPORT_JOB_ERROR_CODES.EXPORT_RENDER_FAILED,
        MSG_RENDER,
      );
    }
  } catch (e) {
    const internalDetail = e instanceof Error ? e.stack ?? e.message : String(e);
    console.error("[worker] export job failed", exportJobId, internalDetail);
    const userSafeMessage =
      "导出任务执行失败，请稍后重试。若问题持续，请联系支持并附上 requestId。";
    try {
      await pool.query(
        `UPDATE export_jobs
              SET status = 'failed',
                  error_code = $2,
                  error_message = $3,
                  updated_at = now()
            WHERE id = $1 AND status IN ('queued', 'running')`,
        [exportJobId, EXPORT_JOB_ERROR_CODES.EXPORT_JOB_FAILED, userSafeMessage],
      );
    } catch (dbErr) {
      console.error(
        "[worker] failed to persist export_jobs failed state",
        exportJobId,
        dbErr instanceof Error ? dbErr.message : String(dbErr),
      );
    }
  }
}
