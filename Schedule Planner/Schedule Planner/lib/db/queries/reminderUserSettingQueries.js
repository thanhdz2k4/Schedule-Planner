import { DEFAULT_REMINDER_LEAD_SECONDS, normalizeLeadSeconds } from "@/lib/reminder/scheduler";

function toIsoDateTime(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  return null;
}

function toModel(row) {
  return {
    id: row.id,
    userId: row.user_id,
    leadSeconds: Number.isInteger(row.lead_seconds)
      ? row.lead_seconds
      : Number.parseInt(row.lead_seconds, 10) || DEFAULT_REMINDER_LEAD_SECONDS,
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  };
}

export async function ensureDefaultReminderUserSetting(db, userId) {
  await db.query(
    `
      INSERT INTO reminder_user_settings (user_id, lead_seconds)
      VALUES ($1::uuid, $2)
      ON CONFLICT (user_id) DO NOTHING
    `,
    [userId, DEFAULT_REMINDER_LEAD_SECONDS]
  );
}

export async function getReminderUserSettingByUser(db, userId) {
  await ensureDefaultReminderUserSetting(db, userId);

  const result = await db.query(
    `
      SELECT id, user_id, lead_seconds, created_at, updated_at
      FROM reminder_user_settings
      WHERE user_id = $1::uuid
      LIMIT 1
    `,
    [userId]
  );

  if (!result.rowCount) {
    return {
      id: "",
      userId,
      leadSeconds: DEFAULT_REMINDER_LEAD_SECONDS,
      createdAt: null,
      updatedAt: null,
    };
  }

  return toModel(result.rows[0]);
}

export async function getReminderLeadSecondsForUser(db, userId) {
  const setting = await getReminderUserSettingByUser(db, userId);
  return normalizeLeadSeconds(setting.leadSeconds, DEFAULT_REMINDER_LEAD_SECONDS);
}

export async function upsertReminderUserSetting(db, { userId, leadSeconds }) {
  const normalizedLeadSeconds = normalizeLeadSeconds(leadSeconds, DEFAULT_REMINDER_LEAD_SECONDS);

  const result = await db.query(
    `
      INSERT INTO reminder_user_settings (user_id, lead_seconds)
      VALUES ($1::uuid, $2)
      ON CONFLICT (user_id)
      DO UPDATE
      SET lead_seconds = EXCLUDED.lead_seconds,
          updated_at = NOW()
      RETURNING id, user_id, lead_seconds, created_at, updated_at
    `,
    [userId, normalizedLeadSeconds]
  );

  return toModel(result.rows[0]);
}
