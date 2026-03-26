import { DEFAULT_REMINDER_LEAD_SECONDS, normalizeLeadSeconds } from "@/lib/reminder/scheduler";

function toDateString(value) {
  if (!value) return null;

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return null;
}

function toTimeString(value) {
  if (!value) return null;

  if (typeof value === "string") {
    return value.slice(0, 5);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(11, 16);
  }

  return null;
}

async function loadUserTimezone(db, userId) {
  const result = await db.query("SELECT timezone FROM users WHERE id = $1::uuid LIMIT 1", [userId]);
  if (!result.rowCount) {
    return "Asia/Ho_Chi_Minh";
  }

  return result.rows[0].timezone || "Asia/Ho_Chi_Minh";
}

export async function listTasksByUser(db, userId) {
  const result = await db.query(
    `
      SELECT id, title, date, start_time, end_time, status, priority, priority_source, goal_id
      FROM tasks
      WHERE user_id = $1
      ORDER BY date ASC, start_time ASC, created_at ASC
    `,
    [userId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    date: toDateString(row.date),
    start: toTimeString(row.start_time),
    end: toTimeString(row.end_time),
    status: row.status,
    priority: row.priority,
    prioritySource: row.priority_source,
    goalId: row.goal_id || "",
  }));
}

export async function replaceTasksForUser(db, userId, tasks) {
  await db.query("DELETE FROM tasks WHERE user_id = $1", [userId]);

  for (const task of tasks) {
    await db.query(
      `
        INSERT INTO tasks (
          id,
          user_id,
          title,
          date,
          start_time,
          end_time,
          status,
          priority,
          priority_source,
          goal_id
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3,
          $4::date,
          $5::time,
          $6::time,
          $7,
          $8,
          $9,
          $10::uuid
        )
      `,
      [
        task.id,
        userId,
        task.title,
        task.date,
        task.start,
        task.end,
        task.status,
        task.priority,
        task.prioritySource,
        task.goalId || null,
      ]
    );
  }
}

export async function rebuildReminderJobsForUser(
  db,
  userId,
  tasks,
  { leadSeconds = DEFAULT_REMINDER_LEAD_SECONDS, integrationId = "gmail" } = {}
) {
  const normalizedLeadSeconds = normalizeLeadSeconds(leadSeconds, DEFAULT_REMINDER_LEAD_SECONDS);
  const normalizedLeadMinutes = Math.floor(normalizedLeadSeconds / 60);
  const safeIntegrationId =
    typeof integrationId === "string" && integrationId.trim() ? integrationId.trim() : "gmail";
  const timezone = await loadUserTimezone(db, userId);

  await db.query(
    `
      DELETE FROM reminder_jobs
      WHERE user_id = $1::uuid
        AND status IN ('pending', 'failed', 'canceled')
    `,
    [userId]
  );

  for (const task of tasks) {
    if (task.status === "done") {
      continue;
    }

    await db.query(
      `
        INSERT INTO reminder_jobs (
          user_id,
          task_id,
          integration_id,
          send_at,
          status,
          retry_count,
          lead_seconds,
          lead_minutes,
          last_error
        )
      VALUES (
          $1::uuid,
          $2::uuid,
          $3,
          ((($4::date + $5::time) AT TIME ZONE $6) - make_interval(secs => $7::int)),
          CASE
            WHEN (($4::date + $5::time) AT TIME ZONE $6) <= NOW() THEN 'canceled'
            ELSE 'pending'
          END,
          0,
          $7::int,
          $8::int,
          CASE
            WHEN (($4::date + $5::time) AT TIME ZONE $6) <= NOW() THEN 'Task started or already passed.'
            ELSE NULL
          END
        )
      `,
      [
        userId,
        task.id,
        safeIntegrationId,
        task.date,
        task.start,
        timezone,
        normalizedLeadSeconds,
        normalizedLeadMinutes,
      ]
    );
  }
}
