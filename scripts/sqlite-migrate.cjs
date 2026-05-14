'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

require('./load-sqlite-env.cjs');

const { resolveSqliteFilePath } = require('@simple-resume/sqlite-pg');
const monorepoRoot = path.join(__dirname, '../../..');
const dbPath = resolveSqliteFilePath(
  process.env.SQLITE_DATABASE_PATH || 'data/simple-resume.db',
  monorepoRoot,
);

const migrationsDir = path.join(__dirname, '..', 'migrations', 'sqlite');
const sqlFile = path.join(migrationsDir, '001_initial.sql');

if (!fs.existsSync(sqlFile)) {
  console.error('Missing migration file:', sqlFile);
  process.exit(1);
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS _schema_migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const name = '001_initial';
const done = db.prepare('SELECT 1 FROM _schema_migrations WHERE name = ?').get(name);
const sql = fs.readFileSync(sqlFile, 'utf8');

db.exec('BEGIN IMMEDIATE');
try {
  // Keep this bootstrap migration idempotent for old local DBs where 001
  // was marked applied before new tables were appended to 001_initial.sql.
  db.exec(sql);
  if (!done) {
    db.prepare('INSERT INTO _schema_migrations (name) VALUES (?)').run(name);
    console.log('SQLite migrations: applied', name);
  } else {
    console.log('SQLite migrations: reconciled', name);
  }
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  console.error(e);
  process.exit(1);
} finally {
  db.close();
}
