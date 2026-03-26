CREATE TABLE IF NOT EXISTS assistant_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('auto', 'ask', 'deny')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT assistant_policies_user_action_unique UNIQUE (user_id, action_type)
);

CREATE INDEX IF NOT EXISTS idx_assistant_policies_user
  ON assistant_policies (user_id);

DROP TRIGGER IF EXISTS assistant_policies_set_updated_at ON assistant_policies;
CREATE TRIGGER assistant_policies_set_updated_at
BEFORE UPDATE ON assistant_policies
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS assistant_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  mode TEXT NOT NULL CHECK (mode IN ('auto', 'ask', 'deny')),
  status TEXT NOT NULL CHECK (
    status IN (
      'proposed',
      'pending_approval',
      'approved',
      'denied',
      'executing',
      'executed',
      'failed',
      'canceled'
    )
  ),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload JSONB NULL,
  dedupe_key TEXT NULL,
  source_workflow TEXT NULL,
  approved_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ NULL,
  executed_at TIMESTAMPTZ NULL,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_actions_user_dedupe
  ON assistant_actions (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assistant_actions_user_created
  ON assistant_actions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_actions_user_status_created
  ON assistant_actions (user_id, status, created_at DESC);

DROP TRIGGER IF EXISTS assistant_actions_set_updated_at ON assistant_actions;
CREATE TRIGGER assistant_actions_set_updated_at
BEFORE UPDATE ON assistant_actions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();
