CREATE TABLE IF NOT EXISTS reminder_user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_seconds INT NOT NULL DEFAULT 300 CHECK (lead_seconds >= 0 AND lead_seconds <= 86400),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reminder_user_settings_user_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_reminder_user_settings_user
  ON reminder_user_settings (user_id);

DROP TRIGGER IF EXISTS reminder_user_settings_set_updated_at ON reminder_user_settings;
CREATE TRIGGER reminder_user_settings_set_updated_at
BEFORE UPDATE ON reminder_user_settings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

ALTER TABLE reminder_jobs
  ADD COLUMN IF NOT EXISTS lead_seconds INT;

UPDATE reminder_jobs
SET lead_seconds = CASE
  WHEN lead_seconds IS NOT NULL THEN lead_seconds
  WHEN lead_minutes IS NOT NULL THEN GREATEST(lead_minutes, 0) * 60
  ELSE 300
END
WHERE lead_seconds IS NULL;

ALTER TABLE reminder_jobs
  ALTER COLUMN lead_seconds SET DEFAULT 300;

ALTER TABLE reminder_jobs
  ALTER COLUMN lead_seconds SET NOT NULL;

ALTER TABLE reminder_jobs
  DROP CONSTRAINT IF EXISTS reminder_jobs_lead_seconds_non_negative;

ALTER TABLE reminder_jobs
  ADD CONSTRAINT reminder_jobs_lead_seconds_non_negative
  CHECK (lead_seconds >= 0 AND lead_seconds <= 86400);
