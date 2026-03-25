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
