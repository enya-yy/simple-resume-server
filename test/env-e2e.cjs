const path = require('node:path');

/** e2e 使用独立 SQLite 文件（与 global-setup-e2e 路径一致） */
process.env.SQLITE_DATABASE_PATH = path.join(
  __dirname,
  'e2e-state.sqlite',
);

if (process.env.EXPORT_PRESIGN_STUB === undefined) {
  process.env.EXPORT_PRESIGN_STUB = 'true';
}
if (!process.env.OPS_METRICS_TOKEN) {
  process.env.OPS_METRICS_TOKEN = 'e2e-ops-metrics-token-32chars!!';
}
