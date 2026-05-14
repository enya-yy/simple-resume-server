const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const e2eDbPath = path.join(__dirname, 'e2e-state.sqlite');

module.exports = async function globalSetup() {
  try {
    fs.unlinkSync(e2eDbPath);
  } catch {
    /* ignore */
  }
  const env = {
    ...process.env,
    SQLITE_DATABASE_PATH: e2eDbPath,
  };
  execSync('pnpm migrate', {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    env,
  });
};
