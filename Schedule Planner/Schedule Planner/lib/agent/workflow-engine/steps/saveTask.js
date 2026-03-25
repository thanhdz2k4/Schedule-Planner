import { BusinessError } from "@/lib/agent/workflow-engine/errors";

function toDateString(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return null;
}

function toTimeString(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 5);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(11, 16);
  return null;
}

function mapTaskRow(row) {
  return {
    id: row.id,
    title: row.title,
    date: toDateString(row.date),
    start: toTimeString(row.start_time),
    end: toTimeString(row.end_time),
    status: row.status,
    priority: row.priority,
    prioritySource: row.priority_source,
    goalId: row.goal_id || "",
  };
}

function normalizeTitleQuery(title) {
  return title.trim().replace(/\s+/g, " ");
}

async function selectTaskCandidates({ db, userId, title, date, exact }) {
  const comparator = exact ? "lower(title) = lower($2)" : "title ILIKE $2";
  const titleValue = exact ? normalizeTitleQuery(title) : `%${normalizeTitleQuery(title)}%`;

  const hasDateFilter = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const params = hasDateFilter ? [userId, titleValue, date] : [userId, titleValue];

  const result = await db.query(
    `
      SELECT id, title, date, start_time, end_time, status, priority, priority_source, goal_id
      FROM tasks
      WHERE user_id = $1::uuid
        AND ${comparator}
        ${hasDateFilter ? "AND date = $3::date" : ""}
      ORDER BY date DESC, start_time DESC
      LIMIT 5
    `,
    params
  );

  return result.rows.map(mapTaskRow);
}

export async function resolveTaskTarget({ db, userId, taskId, title, date }) {
  if (taskId) {
    const result = await db.query(
      `
        SELECT id, title, date, start_time, end_time, status, priority, priority_source, goal_id
        FROM tasks
        WHERE user_id = $1::uuid AND id = $2::uuid
        LIMIT 1
      `,
      [userId, taskId]
    );

    if (!result.rowCount) {
      throw new BusinessError("Task target not found.", {
        code: "TASK_NOT_FOUND",
        status: 404,
        details: { task_id: taskId },
      });
    }

    return mapTaskRow(result.rows[0]);
  }

  const exactCandidates = await selectTaskCandidates({ db, userId, title, date, exact: true });
  if (exactCandidates.length === 1) {
    return exactCandidates[0];
  }
  if (exactCandidates.length > 1) {
    throw new BusinessError("Task target is ambiguous. Please provide a more specific title.", {
      code: "TASK_AMBIGUOUS",
      status: 409,
      details: {
        candidates: exactCandidates.slice(0, 3),
      },
    });
  }

  const fuzzyCandidates = await selectTaskCandidates({ db, userId, title, date, exact: false });
  if (fuzzyCandidates.length === 1) {
    return fuzzyCandidates[0];
  }
  if (fuzzyCandidates.length > 1) {
    throw new BusinessError("Task target is ambiguous. Please provide a more specific title.", {
      code: "TASK_AMBIGUOUS",
      status: 409,
      details: {
        candidates: fuzzyCandidates.slice(0, 3),
      },
    });
  }

  throw new BusinessError("Task target not found.", {
    code: "TASK_NOT_FOUND",
    status: 404,
    details: { title, date: date || null },
  });
}

export async function insertTask({ db, userId, payload }) {
  const result = await db.query(
    `
      INSERT INTO tasks (
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
        $2,
        $3::date,
        $4::time,
        $5::time,
        $6,
        $7,
        'manual',
        NULL
      )
      RETURNING id, title, date, start_time, end_time, status, priority, priority_source, goal_id
    `,
    [userId, payload.title, payload.date, payload.start, payload.end, payload.status, payload.priority]
  );

  return mapTaskRow(result.rows[0]);
}

export async function updateTaskById({ db, userId, taskId, patch }) {
  const fields = [];
  const values = [userId, taskId];
  let parameterIndex = 3;

  if (patch.title !== undefined) {
    fields.push(`title = $${parameterIndex++}`);
    values.push(patch.title);
  }
  if (patch.date !== undefined) {
    fields.push(`date = $${parameterIndex++}::date`);
    values.push(patch.date);
  }
  if (patch.start !== undefined) {
    fields.push(`start_time = $${parameterIndex++}::time`);
    values.push(patch.start);
  }
  if (patch.end !== undefined) {
    fields.push(`end_time = $${parameterIndex++}::time`);
    values.push(patch.end);
  }
  if (patch.status !== undefined) {
    fields.push(`status = $${parameterIndex++}`);
    values.push(patch.status);
  }
  if (patch.priority !== undefined) {
    fields.push(`priority = $${parameterIndex++}`);
    values.push(patch.priority);
  }

  if (!fields.length) {
    throw new BusinessError("No task fields to update.", {
      code: "EMPTY_PATCH",
      status: 400,
    });
  }

  const result = await db.query(
    `
      UPDATE tasks
      SET ${fields.join(", ")}
      WHERE user_id = $1::uuid AND id = $2::uuid
      RETURNING id, title, date, start_time, end_time, status, priority, priority_source, goal_id
    `,
    values
  );

  if (!result.rowCount) {
    throw new BusinessError("Task target not found.", {
      code: "TASK_NOT_FOUND",
      status: 404,
      details: { task_id: taskId },
    });
  }

  return mapTaskRow(result.rows[0]);
}

export async function deleteTaskById({ db, userId, taskId }) {
  const result = await db.query(
    `
      DELETE FROM tasks
      WHERE user_id = $1::uuid AND id = $2::uuid
      RETURNING id, title, date, start_time, end_time, status, priority, priority_source, goal_id
    `,
    [userId, taskId]
  );

  if (!result.rowCount) {
    throw new BusinessError("Task target not found.", {
      code: "TASK_NOT_FOUND",
      status: 404,
      details: { task_id: taskId },
    });
  }

  return mapTaskRow(result.rows[0]);
}

async function loadUserTimezone(db, userId) {
  const result = await db.query("SELECT timezone FROM users WHERE id = $1::uuid LIMIT 1", [userId]);
  if (!result.rowCount) {
    return "Asia/Ho_Chi_Minh";
  }
  return result.rows[0].timezone || "Asia/Ho_Chi_Minh";
}

export async function upsertReminderJob({ db, userId, taskId, date, start, minutesBefore }) {
  if (!Number.isInteger(minutesBefore) || minutesBefore < 0) {
    throw new BusinessError("Reminder offset must be >= 0.", {
      code: "INVALID_REMINDER_OFFSET",
      status: 400,
    });
  }

  const timezone = await loadUserTimezone(db, userId);

  await db.query(
    `
      DELETE FROM reminder_jobs
      WHERE user_id = $1::uuid
        AND task_id = $2::uuid
        AND status IN ('pending', 'failed')
    `,
    [userId, taskId]
  );

  const result = await db.query(
    `
      INSERT INTO reminder_jobs (user_id, task_id, send_at, status, retry_count)
      VALUES (
        $1::uuid,
        $2::uuid,
        ((($3::date + $4::time) AT TIME ZONE $5) - make_interval(mins => $6::int)),
        'pending',
        0
      )
      RETURNING id, send_at, status
    `,
    [userId, taskId, date, start, timezone, minutesBefore]
  );

  return {
    id: result.rows[0].id,
    send_at: result.rows[0].send_at,
    status: result.rows[0].status,
    minutes_before: minutesBefore,
  };
}

export async function cancelPendingReminderJobs({ db, userId, taskId, reason = "workflow_update" }) {
  const result = await db.query(
    `
      UPDATE reminder_jobs
      SET status = 'canceled',
          last_error = COALESCE(last_error, $3),
          updated_at = NOW()
      WHERE user_id = $1::uuid
        AND task_id = $2::uuid
        AND status = 'pending'
    `,
    [userId, taskId, reason]
  );

  return result.rowCount || 0;
}
