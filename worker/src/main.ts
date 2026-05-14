import "./load-local-env.js";
import { PgLikePool, resolveSqliteFilePath } from "@simple-resume/sqlite-pg";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runChatAssistJobStep } from "./chat-assist.worker.js";
import { runExportJobStep } from "./export-pdf.worker.js";
import { runPolishJobStep } from "./polish.worker.js";

function resolveSqlitePath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const monorepoRoot = join(here, "../../..");
  const raw =
    process.env.SQLITE_DATABASE_PATH?.trim() || "data/simple-resume.db";
  return resolveSqliteFilePath(raw, monorepoRoot);
}

async function bootstrap() {
  const sqlitePath = resolveSqlitePath();
  const pool = PgLikePool.open(sqlitePath);

  const tickMs = 600;
  const exportTimer = setInterval(() => {
    void (async () => {
      try {
        const r = await pool.query<{ id: string }>(
          `SELECT id FROM export_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`,
        );
        const id = r.rows[0]?.id;
        if (id) await runExportJobStep(pool, id);
      } catch (e) {
        console.error("[worker] export poll", e);
      }
    })();
  }, tickMs);

  const polishTimer = setInterval(() => {
    void (async () => {
      try {
        const r = await pool.query<{ id: string }>(
          `SELECT id FROM polish_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`,
        );
        const id = r.rows[0]?.id;
        if (id) await runPolishJobStep(pool, id);
      } catch (e) {
        console.error("[worker] polish poll", e);
      }
    })();
  }, tickMs);

  const chatTimer = setInterval(() => {
    void (async () => {
      try {
        const r = await pool.query<{ id: string }>(
          `SELECT id FROM chat_assist_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`,
        );
        const id = r.rows[0]?.id;
        if (id) await runChatAssistJobStep(pool, id);
      } catch (e) {
        console.error("[worker] chat-assist poll", e);
      }
    })();
  }, tickMs);

  const shutdown = async (signal: string) => {
    console.info(`[worker] ${signal}, closing...`);
    clearInterval(exportTimer);
    clearInterval(polishTimer);
    clearInterval(chatTimer);
    await pool.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  console.info(
    `[worker] SQLite poll ready (${sqlitePath}) export + polish + chat-assist`,
  );
}

bootstrap().catch((error) => {
  console.error("[worker] bootstrap failed", error);
  process.exit(1);
});
