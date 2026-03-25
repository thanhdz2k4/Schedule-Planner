import { BusinessError } from "@/lib/agent/workflow-engine/errors";

function toTimeString(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 5);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(11, 16);
  return null;
}

export async function assertNoTaskOverlap({ db, userId, date, start, end, excludeTaskId = null }) {
  const result = await db.query(
    `
      SELECT id, title, start_time, end_time
      FROM tasks
      WHERE user_id = $1::uuid
        AND date = $2::date
        AND ($3::uuid IS NULL OR id <> $3::uuid)
        AND NOT ($5::time <= start_time OR $4::time >= end_time)
      ORDER BY start_time ASC
      LIMIT 1
    `,
    [userId, date, excludeTaskId, start, end]
  );

  if (!result.rowCount) {
    return null;
  }

  const conflict = result.rows[0];
  throw new BusinessError("Task time overlaps with an existing task.", {
    code: "TASK_TIME_OVERLAP",
    status: 409,
    details: {
      conflict_task_id: conflict.id,
      conflict_title: conflict.title,
      conflict_start: toTimeString(conflict.start_time),
      conflict_end: toTimeString(conflict.end_time),
    },
  });
}
