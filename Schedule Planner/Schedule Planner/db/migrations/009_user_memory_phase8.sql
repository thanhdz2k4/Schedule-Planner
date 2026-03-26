CREATE TABLE IF NOT EXISTS user_memory_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fact_type TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  fact_value TEXT NOT NULL,
  confidence NUMERIC(4, 3) NOT NULL DEFAULT 0.700 CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT NOT NULL DEFAULT 'chat',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_memory_facts_user_fact_unique UNIQUE (user_id, fact_type, fact_key)
);

CREATE INDEX IF NOT EXISTS idx_user_memory_facts_user
  ON user_memory_facts (user_id);

CREATE INDEX IF NOT EXISTS idx_user_memory_facts_user_type
  ON user_memory_facts (user_id, fact_type);

CREATE INDEX IF NOT EXISTS idx_user_memory_facts_user_seen
  ON user_memory_facts (user_id, last_seen_at DESC);

DROP TRIGGER IF EXISTS user_memory_facts_set_updated_at ON user_memory_facts;
CREATE TRIGGER user_memory_facts_set_updated_at
BEFORE UPDATE ON user_memory_facts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS memory_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_events_user_created
  ON memory_events (user_id, created_at DESC);
