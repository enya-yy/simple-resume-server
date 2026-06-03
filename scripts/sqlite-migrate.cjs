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
const migrationFiles = [
  '001_initial.sql',
  '002_resume_title_locked.sql',
  '003_import_jobs.sql',
  '004_user_credits.sql',
  '005_admin_users.sql',
  '006_user_last_access.sql',
];

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

  if (name === '004_user_credits') {
    const userCols = db.prepare('PRAGMA table_info(users)').all();
    const hasCreditsBalance = userCols.some((c) => c.name === 'credits_balance');
    const hasPlan = userCols.some((c) => c.name === 'plan');

    db.exec('BEGIN IMMEDIATE');
    try {
      if (!hasCreditsBalance) {
        db.exec(
          'ALTER TABLE users ADD COLUMN credits_balance INTEGER NOT NULL DEFAULT 30',
        );
      }
      if (!hasPlan) {
        db.exec(
          "ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'trial'",
        );
      }
      db.exec(`
        CREATE TABLE IF NOT EXISTS credit_ledger (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
          delta INTEGER NOT NULL,
          reason TEXT NOT NULL,
          ref_id TEXT,
          balance_after INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_credit_ledger_user ON credit_ledger (user_id);
        CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created ON credit_ledger (user_id, created_at);
      `);
      if (!done) {
        db.prepare('INSERT INTO _schema_migrations (name) VALUES (?)').run(name);
        console.log(
          hasCreditsBalance || hasPlan
            ? 'SQLite migrations: reconciled'
            : 'SQLite migrations: applied',
          name,
        );
      } else {
        console.log('SQLite migrations: skipped (already applied)', name);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('Migration failed:', name, e);
      process.exit(1);
    }
    continue;
  }

  if (name === '005_admin_users') {
    const userCols = db.prepare('PRAGMA table_info(users)').all();
    const hasRole = userCols.some((c) => c.name === 'role');
    const hasDisabledAt = userCols.some((c) => c.name === 'disabled_at');

    db.exec('BEGIN IMMEDIATE');
    try {
      if (!hasRole) {
        db.exec(
          "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'",
        );
      }
      if (!hasDisabledAt) {
        db.exec('ALTER TABLE users ADD COLUMN disabled_at TEXT');
      }
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
        CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
      `);
      if (!done) {
        db.prepare('INSERT INTO _schema_migrations (name) VALUES (?)').run(name);
        console.log(
          hasRole || hasDisabledAt
            ? 'SQLite migrations: reconciled'
            : 'SQLite migrations: applied',
          name,
        );
      } else {
        console.log('SQLite migrations: skipped (already applied)', name);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('Migration failed:', name, e);
      process.exit(1);
    }
    continue;
  }

  if (name === '006_user_last_access') {
    const userCols = db.prepare('PRAGMA table_info(users)').all();
    const hasLastAccessAt = userCols.some((c) => c.name === 'last_access_at');

    db.exec('BEGIN IMMEDIATE');
    try {
      if (!hasLastAccessAt) {
        db.exec('ALTER TABLE users ADD COLUMN last_access_at TEXT');
      }
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_users_last_access ON users (last_access_at)',
      );
      if (!done) {
        db.prepare('INSERT INTO _schema_migrations (name) VALUES (?)').run(name);
        console.log(
          hasLastAccessAt
            ? 'SQLite migrations: reconciled'
            : 'SQLite migrations: applied',
          name,
        );
      } else {
        console.log('SQLite migrations: skipped (already applied)', name);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('Migration failed:', name, e);
      process.exit(1);
    }
    continue;
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
