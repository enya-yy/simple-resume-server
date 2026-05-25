'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

require('./load-sqlite-env.cjs');

const { resolveSqliteFilePath } = require('@simple-resume/sqlite-pg');
const monorepoRoot = path.join(__dirname, '../..');
const defaultDbPath =
  process.env.NODE_ENV === 'production'
    ? '/home/ubuntu/projects/simple-resume/db/simple-resume.db'
    : 'local-db/simple-resume.db';
const dbPath = resolveSqliteFilePath(
  process.env.SQLITE_DATABASE_PATH || defaultDbPath,
  monorepoRoot,
);

const migrationsDir = path.join(__dirname, '..', 'migrations', 'sqlite');
const migrationFiles = ['001_initial.sql', '002_resume_title_locked.sql'];

for (const file of migrationFiles) {
  const full = path.join(migrationsDir, file);
  if (!fs.existsSync(full)) {
    console.error('Missing migration file:', full);
    process.exit(1);
  }
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

for (const file of migrationFiles) {
  const name = file.replace(/\.sql$/, '');
  const sqlPath = path.join(migrationsDir, file);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const done = db
    .prepare('SELECT 1 FROM _schema_migrations WHERE name = ?')
    .get(name);

  if (name === '002_resume_title_locked') {
    const cols = db.prepare('PRAGMA table_info(resumes)').all();
    if (cols.some((c) => c.name === 'title_locked')) {
      if (!done) {
        db.prepare('INSERT INTO _schema_migrations (name) VALUES (?)').run(name);
      }
      console.log('SQLite migrations: skipped (column exists)', name);
      continue;
    }
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(sql);
    if (!done) {
      db.prepare('INSERT INTO _schema_migrations (name) VALUES (?)').run(name);
      console.log('SQLite migrations: applied', name);
    } else if (name === '001_initial') {
      console.log('SQLite migrations: reconciled', name);
    } else {
      console.log('SQLite migrations: skipped (already applied)', name);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    console.error('Migration failed:', name, e);
    process.exit(1);
  }
}

db.close();
