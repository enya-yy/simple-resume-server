'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const apiDir = path.join(__dirname, '..');
const repoRoot = path.join(apiDir, '..', '..');
const rootEnv = path.join(repoRoot, '.env');
const apiEnv = path.join(apiDir, '.env');

if (fs.existsSync(rootEnv)) dotenv.config({ path: rootEnv });
if (fs.existsSync(apiEnv)) dotenv.config({ path: apiEnv });

function defaultSqliteDatabasePath() {
  return process.env.NODE_ENV === 'production'
    ? '/home/ubuntu/projects/simple-resume/db/simple-resume.db'
    : 'local-db/simple-resume.db';
}

if (!process.env.SQLITE_DATABASE_PATH) {
  process.env.SQLITE_DATABASE_PATH = defaultSqliteDatabasePath();
}
