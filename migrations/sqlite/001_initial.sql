-- SQLite schema (current app shape; replaces former Postgres migrations).

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expire TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);

CREATE TABLE IF NOT EXISTS resumes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '未命名简历',
  document_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes (user_id);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  resume_id TEXT NOT NULL REFERENCES resumes (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_sessions_resume_active ON chat_sessions (resume_id)
WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions (user_id, updated_at)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions (id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content_type TEXT NOT NULL,
  content_json TEXT NOT NULL,
  intent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (role IN ('user', 'assistant', 'system')),
  CHECK (content_type IN ('text', 'form_card', 'layout_command'))
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages (session_id, created_at);

CREATE TABLE IF NOT EXISTS export_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  resume_id TEXT NOT NULL REFERENCES resumes (id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  artifact_object_key TEXT,
  artifact_content_type TEXT,
  artifact_size_bytes INTEGER,
  completed_at TEXT,
  request_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_export_jobs_user ON export_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_export_jobs_request ON export_jobs (request_id)
WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS polish_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  resume_id TEXT NOT NULL REFERENCES resumes (id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  module_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  bullet_index INTEGER,
  original_text TEXT,
  polished_text TEXT,
  error_code TEXT,
  error_message TEXT,
  completed_at TEXT,
  request_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_polish_jobs_user ON polish_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_polish_jobs_request ON polish_jobs (request_id)
WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS chat_assist_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  resume_id TEXT NOT NULL REFERENCES resumes (id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  assist_kind TEXT NOT NULL,
  target_hint TEXT,
  context_hint TEXT,
  suggestion_text TEXT,
  error_code TEXT,
  error_message TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_assist_jobs_user ON chat_assist_jobs (user_id);

CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  resume_id TEXT NOT NULL REFERENCES resumes (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  password_hash TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shares_token ON shares (token_hash);
CREATE INDEX IF NOT EXISTS idx_shares_user ON shares (user_id);
