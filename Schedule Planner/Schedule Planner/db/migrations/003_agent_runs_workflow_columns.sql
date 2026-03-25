ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS run_type TEXT NOT NULL DEFAULT 'route',
  ADD COLUMN IF NOT EXISTS error_message TEXT NULL,
  ADD COLUMN IF NOT EXISTS duration_ms INT NULL,
  ADD COLUMN IF NOT EXISTS step_logs JSONB NULL;

UPDATE agent_runs
SET run_type = 'route'
WHERE run_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_runs_run_type_created_at_desc
  ON agent_runs (run_type, created_at DESC);
