CREATE TABLE IF NOT EXISTS chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('telegram')),
  external_chat_id TEXT NOT NULL,
  title TEXT NULL,
  context_json JSONB NULL,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_threads_user_channel_external_unique UNIQUE (user_id, channel, external_chat_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_threads_user_last_message
  ON chat_threads (user_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_threads_channel_external
  ON chat_threads (channel, external_chat_id);

DROP TRIGGER IF EXISTS chat_threads_set_updated_at ON chat_threads;
CREATE TRIGGER chat_threads_set_updated_at
BEFORE UPDATE ON chat_threads
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'internal')),
  content TEXT NOT NULL,
  external_message_id TEXT NULL,
  raw_payload JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created
  ON chat_messages (thread_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_external
  ON chat_messages (external_message_id);
