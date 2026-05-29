ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

ALTER TABLE users ADD COLUMN disabled_at TEXT;

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
