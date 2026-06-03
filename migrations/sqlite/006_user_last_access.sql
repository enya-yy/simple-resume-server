ALTER TABLE users ADD COLUMN last_access_at TEXT;

CREATE INDEX IF NOT EXISTS idx_users_last_access ON users (last_access_at);
