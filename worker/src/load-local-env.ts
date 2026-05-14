import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(dir, "../../../.env") });
config({ path: resolve(dir, "../.env") });

if (!process.env.SQLITE_DATABASE_PATH) {
  process.env.SQLITE_DATABASE_PATH = "data/simple-resume.db";
}
