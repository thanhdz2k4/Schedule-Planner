ALTER TABLE reminder_jobs
  ADD COLUMN IF NOT EXISTS integration_id TEXT;

UPDATE reminder_jobs
SET integration_id = 'gmail'
WHERE integration_id IS NULL;

ALTER TABLE reminder_jobs
  ALTER COLUMN integration_id SET DEFAULT 'gmail';

ALTER TABLE reminder_jobs
  ALTER COLUMN integration_id SET NOT NULL;

ALTER TABLE reminder_jobs
  ADD COLUMN IF NOT EXISTS connection_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS delivery_provider TEXT NULL,
  ADD COLUMN IF NOT EXISTS external_message_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS lead_minutes INT NOT NULL DEFAULT 5;

ALTER TABLE reminder_jobs
  DROP CONSTRAINT IF EXISTS reminder_jobs_lead_minutes_non_negative;

ALTER TABLE reminder_jobs
  ADD CONSTRAINT reminder_jobs_lead_minutes_non_negative CHECK (lead_minutes >= 0);

CREATE INDEX IF NOT EXISTS idx_reminder_jobs_integration_status_send_at
  ON reminder_jobs (integration_id, status, send_at);

CREATE TABLE IF NOT EXISTS reminder_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_job_id UUID NOT NULL REFERENCES reminder_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  integration_id TEXT NOT NULL,
  delivery_provider TEXT NOT NULL,
  connection_id TEXT NULL,
  attempt_no INT NOT NULL CHECK (attempt_no > 0),
  is_success BOOLEAN NOT NULL,
  request_payload JSONB NULL,
  response_payload JSONB NULL,
  error_code TEXT NULL,
  error_message TEXT NULL,
  duration_ms INT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminder_deliveries_job_created
  ON reminder_deliveries (reminder_job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reminder_deliveries_user_created
  ON reminder_deliveries (user_id, created_at DESC);
