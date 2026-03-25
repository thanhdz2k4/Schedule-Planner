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

export async function listGoalsByUser(db, userId) {
  const result = await db.query(
    `
      SELECT id, title, target, deadline
      FROM goals
      WHERE user_id = $1
      ORDER BY deadline ASC, created_at ASC
    `,
    [userId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    target: Number(row.target),
    deadline: toDateString(row.deadline),
  }));
}

export async function replaceGoalsForUser(db, userId, goals) {
  await db.query("DELETE FROM goals WHERE user_id = $1", [userId]);

  for (const goal of goals) {
    await db.query(
      `
        INSERT INTO goals (id, user_id, title, target, deadline)
        VALUES ($1::uuid, $2::uuid, $3, $4::int, $5::date)
      `,
      [goal.id, userId, goal.title, goal.target, goal.deadline]
    );
  }
}
