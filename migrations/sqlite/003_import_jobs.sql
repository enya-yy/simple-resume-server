CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  resume_id TEXT NOT NULL REFERENCES resumes (id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_mime TEXT,
  source_object_key TEXT,
  source_text TEXT,
  extracted_text TEXT,
  error_code TEXT,
  error_message TEXT,
  completed_at TEXT,
  request_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_user ON import_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_request ON import_jobs (request_id)
WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_import_jobs_created ON import_jobs (user_id, created_at);
