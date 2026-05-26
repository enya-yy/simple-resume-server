import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { PgLikePool } from '@simple-resume/sqlite-pg';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const RETENTION_HOURS = 24;

function defaultLocalImportDir(): string {
  return join(process.cwd(), 'local-tmp', 'imports');
}

export async function cleanupStaleImportArtifacts(
  pool: PgLikePool,
): Promise<void> {
  const cutoff = new Date(
    Date.now() - RETENTION_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const rows = await pool.query<{ source_object_key: string }>(
    `SELECT source_object_key
       FROM import_jobs
      WHERE source_object_key IS NOT NULL
        AND created_at < $1
        AND status IN ('succeeded', 'failed')
      LIMIT 50`,
    [cutoff],
  );

  const baseDir =
    process.env.IMPORT_LOCAL_DIR?.trim() || defaultLocalImportDir();

  for (const row of rows.rows) {
    const key = row.source_object_key;
    if (!key) continue;
    try {
      await rm(join(baseDir, key), { force: true, recursive: true });
    } catch {
      /* best effort */
    }
  }
}

export function startImportCleanupTimer(pool: PgLikePool): ReturnType<typeof setInterval> {
  return setInterval(() => {
    void cleanupStaleImportArtifacts(pool).catch((e) => {
      console.error(
        '[api-inline-worker] import cleanup failed',
        e instanceof Error ? e.message : String(e),
      );
    });
  }, CLEANUP_INTERVAL_MS);
}
