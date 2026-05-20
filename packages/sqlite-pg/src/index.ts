import Database from 'better-sqlite3';

export { resolveSqliteFilePath } from './resolveSqliteFilePath';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** Serialize async work touching the DB (SQLite + async transactions). */
export class SimpleMutex {
  private tail: Promise<void> = Promise.resolve();

  runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(() => fn());
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

export function substPgParams(
  sql: string,
  params: unknown[],
): { sql: string; args: unknown[] } {
  const args: unknown[] = [];
  const out = sql.replace(/\$(\d+)/g, (_, d) => {
    const i = parseInt(d, 10) - 1;
    args.push(params[i]);
    return '?';
  });
  return { sql: out, args };
}

export function rewriteSqlDialect(sql: string): string {
  let s = sql;
  s = s.replace(/::jsonb/gi, '');
  s = s.replace(/::int/gi, '');
  s = s.replace(/\bnow\s*\(\s*\)/gi, "datetime('now')");
  s = s.replace(/\bFOR UPDATE\b/gi, '');
  return s;
}

function postProcessRow(row: Record<string, unknown>): void {
  for (const k of Object.keys(row)) {
    const v = row[k];
    if (typeof v !== 'string' || v.length === 0) continue;
    if (
      k.endsWith('_at') ||
      k === 'expire' ||
      k === 'created_at' ||
      k === 'updated_at' ||
      k === 'completed_at' ||
      k === 'expires_at'
    ) {
      if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
        row[k] = new Date(v);
      }
    }
    if (
      (k.endsWith('_json') ||
        k === 'document_json' ||
        k === 'layout_options' ||
        k === 'sess') &&
      (v.startsWith('{') || v.startsWith('['))
    ) {
      try {
        row[k] = JSON.parse(v) as unknown;
      } catch {
        /* keep string */
      }
    }
  }
}

function postProcessRows<T>(rows: T[]): T[] {
  for (const row of rows as Record<string, unknown>[]) {
    postProcessRow(row);
  }
  return rows;
}

export interface QueryResult<T = unknown> {
  rows: T[];
  rowCount: number;
}

export class PgLikeClient {
  constructor(private readonly pool: PgLikePool) {}

  async query<T = unknown>(
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    return Promise.resolve(this.pool.queryUnlocked<T>(text, params));
  }

  async release(): Promise<void> {
    /* held by outer transaction mutex */
  }
}

/**
 * small pg-like API on top of better-sqlite3 (WAL, foreign_keys).
 * All `query` calls are serialized for safe concurrent Nest handlers.
 */
export class PgLikePool {
  private readonly mutex = new SimpleMutex();

  private constructor(private readonly db: Database.Database) {}

  static open(filePath: string): PgLikePool {
    mkdirSync(dirname(filePath), { recursive: true });
    const db = new Database(filePath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 8000');
    return new PgLikePool(db);
  }

  get raw(): Database.Database {
    return this.db;
  }

  async query<T = unknown>(
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.mutex.runExclusive(async () =>
      Promise.resolve(this.queryUnlocked<T>(text, params)),
    );
  }

  queryUnlocked<T = unknown>(text: string, params: unknown[] = []): QueryResult<T> {
    const { sql: s1, args } = substPgParams(text, params);
    const sql = rewriteSqlDialect(s1);
    const stmt = this.db.prepare(sql);
    if (/RETURNING/i.test(sql)) {
      const row = stmt.get(...args) as T | undefined;
      const rows = (row !== undefined && row !== null ? [row] : []) as T[];
      postProcessRows(rows);
      return { rows, rowCount: rows.length };
    }
    const head = sql.trimStart().slice(0, 12).toUpperCase();
    if (head.startsWith('SELECT') || head.startsWith('WITH')) {
      const rows = stmt.all(...args) as T[];
      postProcessRows(rows);
      return { rows, rowCount: rows.length };
    }
    const info = stmt.run(...args);
    return { rows: [], rowCount: info.changes };
  }

  async transaction<T>(fn: (client: PgLikeClient) => Promise<T>): Promise<T> {
    return this.mutex.runExclusive(async () => {
      this.db.exec('BEGIN IMMEDIATE');
      const client = new PgLikeClient(this);
      try {
        const r = await fn(client);
        this.db.exec('COMMIT');
        return r;
      } catch (e) {
        try {
          this.db.exec('ROLLBACK');
        } catch {
          /* ignore */
        }
        throw e;
      }
    });
  }

  async close(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      this.db.close();
    });
  }
}
