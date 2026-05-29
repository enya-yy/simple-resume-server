ALTER TABLE users ADD COLUMN credits_balance INTEGER NOT NULL DEFAULT 30;

ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'trial';

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
