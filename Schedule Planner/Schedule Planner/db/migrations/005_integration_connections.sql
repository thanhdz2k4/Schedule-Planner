CREATE TABLE IF NOT EXISTS integration_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  integration_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  provider TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disconnected', 'error')),
  last_error TEXT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT integration_connections_user_integration_unique UNIQUE (user_id, integration_id),
  CONSTRAINT integration_connections_connection_unique UNIQUE (connection_id)
);

CREATE INDEX IF NOT EXISTS integration_connections_user_idx
  ON integration_connections (user_id);

CREATE INDEX IF NOT EXISTS integration_connections_status_idx
  ON integration_connections (status);

DROP TRIGGER IF EXISTS integration_connections_set_updated_at ON integration_connections;
CREATE TRIGGER integration_connections_set_updated_at
BEFORE UPDATE ON integration_connections
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();
