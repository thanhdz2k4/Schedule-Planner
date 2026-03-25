const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const DEFAULT_USER_ID =
  typeof process.env.PLANNER_DEFAULT_USER_ID === "string" &&
  UUID_REGEX.test(process.env.PLANNER_DEFAULT_USER_ID)
    ? process.env.PLANNER_DEFAULT_USER_ID
    : "00000000-0000-0000-0000-000000000001";

export const DEFAULT_USER_TIMEZONE =
  typeof process.env.PLANNER_DEFAULT_TIMEZONE === "string" && process.env.PLANNER_DEFAULT_TIMEZONE.trim()
    ? process.env.PLANNER_DEFAULT_TIMEZONE.trim()
    : "Asia/Ho_Chi_Minh";

export function resolveUserId(rawUserId) {
  if (typeof rawUserId !== "string") {
    return DEFAULT_USER_ID;
  }

  const trimmed = rawUserId.trim();
  return UUID_REGEX.test(trimmed) ? trimmed : DEFAULT_USER_ID;
}

export async function ensureUserExists(db, userId, timezone = DEFAULT_USER_TIMEZONE) {
  await db.query(
    `
      INSERT INTO users (id, timezone)
      VALUES ($1::uuid, $2)
      ON CONFLICT (id)
      DO UPDATE SET timezone = EXCLUDED.timezone, updated_at = NOW()
    `,
    [userId, timezone]
  );
}
