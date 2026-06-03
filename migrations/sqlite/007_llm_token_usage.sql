CREATE TABLE IF NOT EXISTS llm_token_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  model TEXT,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  request_id TEXT,
  ref_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_llm_token_usage_user ON llm_token_usage (user_id);

CREATE INDEX IF NOT EXISTS idx_llm_token_usage_user_created ON llm_token_usage (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_llm_token_usage_created ON llm_token_usage (created_at);
