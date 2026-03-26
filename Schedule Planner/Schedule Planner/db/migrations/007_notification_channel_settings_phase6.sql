CREATE TABLE IF NOT EXISTS notification_channel_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('gmail', 'telegram')),
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority_order INT NOT NULL DEFAULT 100,
  destination TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_channel_settings_user_channel_unique UNIQUE (user_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_notification_channel_settings_user
  ON notification_channel_settings (user_id);

CREATE INDEX IF NOT EXISTS idx_notification_channel_settings_user_enabled_priority
  ON notification_channel_settings (user_id, is_enabled, priority_order ASC);

DROP TRIGGER IF EXISTS notification_channel_settings_set_updated_at ON notification_channel_settings;
CREATE TRIGGER notification_channel_settings_set_updated_at
BEFORE UPDATE ON notification_channel_settings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

INSERT INTO notification_channel_settings (user_id, channel, is_enabled, priority_order)
SELECT id, 'telegram', TRUE, 1
FROM users
ON CONFLICT (user_id, channel) DO NOTHING;

INSERT INTO notification_channel_settings (user_id, channel, is_enabled, priority_order)
SELECT id, 'gmail', TRUE, 2
FROM users
ON CONFLICT (user_id, channel) DO NOTHING;
