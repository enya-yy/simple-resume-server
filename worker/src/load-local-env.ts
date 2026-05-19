import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(dir, "../../../.env") });
config({ path: resolve(dir, "../.env") });

function defaultSqliteDatabasePath(): string {
  return process.env.NODE_ENV === "production"
    ? "/home/ubuntu/projects/simple-resume/db/simple-resume.db"
    : "local-db/simple-resume.db";
}

if (!process.env.SQLITE_DATABASE_PATH) {
  process.env.SQLITE_DATABASE_PATH = defaultSqliteDatabasePath();
}
