import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";

import type { ExportStorageTarget } from "../config/export-storage.js";
import { localExportFilePath } from "../config/export-storage.js";
import { uploadExportPdf } from "./uploadExportArtifact.js";

export async function saveExportPdf(
  target: ExportStorageTarget,
  objectKey: string,
  body: Buffer,
): Promise<void> {
  if (target.kind === "s3") {
    await uploadExportPdf(target.env, objectKey, body);
    return;
  }
  const filePath = localExportFilePath(target.rootDir, objectKey);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, Uint8Array.from(body));
}
