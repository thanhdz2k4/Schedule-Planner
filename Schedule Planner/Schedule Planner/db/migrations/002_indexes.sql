CREATE INDEX IF NOT EXISTS idx_tasks_user_date
  ON tasks (user_id, date);

CREATE INDEX IF NOT EXISTS idx_tasks_user_status_priority
  ON tasks (user_id, status, priority);

CREATE INDEX IF NOT EXISTS idx_goals_user_deadline
  ON goals (user_id, deadline);

CREATE INDEX IF NOT EXISTS idx_reminder_jobs_status_send_at
  ON reminder_jobs (status, send_at);

CREATE INDEX IF NOT EXISTS idx_agent_runs_user_created_at_desc
  ON agent_runs (user_id, created_at DESC);
