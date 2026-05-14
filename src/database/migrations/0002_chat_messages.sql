CREATE TABLE chat_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role          VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content_type  VARCHAR(30) NOT NULL CHECK (content_type IN ('text', 'form_card', 'layout_command')),
  content_json  JSONB NOT NULL,
  intent        VARCHAR(50),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages__session_id_created_at
  ON chat_messages (session_id, created_at);
