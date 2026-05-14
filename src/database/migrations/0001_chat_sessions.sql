-- Chat Sessions table: 1:1 binding between resume and chat session
-- Story 0.2: chat_messages table will be added in Story 0.4

CREATE TABLE IF NOT EXISTS chat_sessions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id     UUID        NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active_version_id UUID    REFERENCES resume_versions(id) ON DELETE SET NULL,
  title         VARCHAR(200) NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

-- 1:1 constraint: one active resume maps to at most one active session (soft-delete compatible)
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_sessions__resume_active
  ON chat_sessions (resume_id)
  WHERE deleted_at IS NULL;

-- Query optimization: user session list ordered by updated_at DESC
CREATE INDEX IF NOT EXISTS idx_chat_sessions__user_id_updated_at
  ON chat_sessions (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;
