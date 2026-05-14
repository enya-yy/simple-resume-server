import type { Database } from 'better-sqlite3';
import type session from 'express-session';

type Store = session.Store;
type SessionData = session.SessionData;

/** express-session Store backed by the same SQLite file as the app (`session` table). */
export function createSqliteSessionStore(
  sessionModule: typeof session,
  db: Database,
): Store {
  db.exec(`
    CREATE TABLE IF NOT EXISTS session (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expire TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);
  `);

  const StoreCtor = sessionModule.Store;

  return new (class extends StoreCtor {
    constructor() {
      super();
    }

    private readonly getStmt = db.prepare(
      'SELECT sess, expire FROM session WHERE sid = ?',
    );

    private readonly upsertStmt = db.prepare(
      `INSERT INTO session (sid, sess, expire) VALUES (?, ?, ?)
       ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expire = excluded.expire`,
    );

    private readonly destroyStmt = db.prepare(
      'DELETE FROM session WHERE sid = ?',
    );

    private readonly touchStmt = db.prepare(
      'UPDATE session SET expire = ? WHERE sid = ?',
    );

    override get(
      sid: string,
      callback: (err: Error | null, sess?: SessionData | null) => void,
    ): void {
      try {
        const row = this.getStmt.get(sid) as
          | { sess: string; expire: string }
          | undefined;
        if (!row) {
          callback(null, null);
          return;
        }
        const exp = new Date(row.expire).getTime();
        if (Number.isFinite(exp) && exp < Date.now()) {
          this.destroyStmt.run(sid);
          callback(null, null);
          return;
        }
        callback(null, JSON.parse(row.sess) as SessionData);
      } catch (e) {
        callback(e as Error);
      }
    }

    override set(
      sid: string,
      sess: SessionData,
      callback?: (err?: Error) => void,
    ): void {
      try {
        const expireAt = sess.cookie?.expires
          ? new Date(sess.cookie.expires).toISOString()
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        this.upsertStmt.run(sid, JSON.stringify(sess), expireAt);
        callback?.();
      } catch (e) {
        callback?.(e as Error);
      }
    }

    override destroy(sid: string, callback?: (err?: Error) => void): void {
      try {
        this.destroyStmt.run(sid);
        callback?.();
      } catch (e) {
        callback?.(e as Error);
      }
    }

    override touch(
      sid: string,
      sess: SessionData,
      callback?: (err?: Error) => void,
    ): void {
      try {
        const expireAt = sess.cookie?.expires
          ? new Date(sess.cookie.expires).toISOString()
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        this.touchStmt.run(expireAt, sid);
        callback?.();
      } catch (e) {
        callback?.(e as Error);
      }
    }
  })();
}
