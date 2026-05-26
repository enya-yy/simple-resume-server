import type { PgLikePool } from '@simple-resume/sqlite-pg';
import { runChatAssistJobStep } from './chat-assist.worker';
import { runExportJobStep } from './export-pdf.worker';
import { runImportJobStep } from './import-resume.worker';
import { startImportCleanupTimer } from './import/import-cleanup';
import { runPolishJobStep } from './polish.worker';

type WorkerTimer = ReturnType<typeof setInterval>;

export type InProcessWorkerController = {
  stop: () => void;
};

function startPollingJob(params: {
  pool: PgLikePool;
  table: 'export_jobs' | 'polish_jobs' | 'chat_assist_jobs' | 'import_jobs';
  logTag: string;
  tickMs: number;
  run: (pool: PgLikePool, id: string) => Promise<void>;
}): WorkerTimer {
  let running = false;
  return setInterval(() => {
    if (running) return;
    running = true;
    void (async () => {
      try {
        const r = await params.pool.query<{ id: string }>(
          `SELECT id FROM ${params.table} WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`,
        );
        const id = r.rows[0]?.id;
        if (id) {
          await params.run(params.pool, id);
        }
      } catch (e) {
        console.error(`[api-inline-worker] ${params.logTag} poll`, e);
      } finally {
        running = false;
      }
    })();
  }, params.tickMs);
}

export function startInProcessWorker(
  pool: PgLikePool,
): InProcessWorkerController {
  const tickMs = 600;

  const exportTimer = startPollingJob({
    pool,
    table: 'export_jobs',
    logTag: 'export',
    tickMs,
    run: runExportJobStep,
  });
  const polishTimer = startPollingJob({
    pool,
    table: 'polish_jobs',
    logTag: 'polish',
    tickMs,
    run: runPolishJobStep,
  });
  const chatTimer = startPollingJob({
    pool,
    table: 'chat_assist_jobs',
    logTag: 'chat-assist',
    tickMs,
    run: runChatAssistJobStep,
  });
  const importTimer = startPollingJob({
    pool,
    table: 'import_jobs',
    logTag: 'import',
    tickMs,
    run: runImportJobStep,
  });
  const importCleanupTimer = startImportCleanupTimer(pool);

  console.info('[api-inline-worker] started: export + polish + chat-assist + import');

  return {
    stop: () => {
      clearInterval(exportTimer);
      clearInterval(polishTimer);
      clearInterval(chatTimer);
      clearInterval(importTimer);
      clearInterval(importCleanupTimer);
      console.info('[api-inline-worker] stopped');
    },
  };
}
