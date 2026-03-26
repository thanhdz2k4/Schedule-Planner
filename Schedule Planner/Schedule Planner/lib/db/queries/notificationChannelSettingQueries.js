const DEFAULT_CHANNEL_SETTINGS = [
  { channel: "telegram", priorityOrder: 1 },
  { channel: "gmail", priorityOrder: 2 },
];

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

function toSettingModel(row) {
  return {
    id: row.id,
    userId: row.user_id,
    channel: row.channel,
    isEnabled: Boolean(row.is_enabled),
    priorityOrder: Number.isInteger(row.priority_order) ? row.priority_order : Number.parseInt(row.priority_order, 10) || 100,
    destination: row.destination || "",
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  };
}

export async function ensureDefaultNotificationChannelSettings(db, userId) {
  for (const item of DEFAULT_CHANNEL_SETTINGS) {
    await db.query(
      `
        INSERT INTO notification_channel_settings (user_id, channel, is_enabled, priority_order)
        VALUES ($1::uuid, $2, TRUE, $3)
        ON CONFLICT (user_id, channel)
        DO NOTHING
      `,
      [userId, item.channel, item.priorityOrder]
    );
  }
}

export async function listNotificationChannelSettingsByUser(db, userId) {
  const result = await db.query(
    `
      SELECT id, user_id, channel, is_enabled, priority_order, destination, created_at, updated_at
      FROM notification_channel_settings
      WHERE user_id = $1::uuid
      ORDER BY priority_order ASC, channel ASC
    `,
    [userId]
  );

  return result.rows.map(toSettingModel);
}

export async function getNotificationChannelSettingByUser(db, userId, channel) {
  const result = await db.query(
    `
      SELECT id, user_id, channel, is_enabled, priority_order, destination, created_at, updated_at
      FROM notification_channel_settings
      WHERE user_id = $1::uuid
        AND channel = $2
      LIMIT 1
    `,
    [userId, channel]
  );

  if (!result.rowCount) {
    return null;
  }

  return toSettingModel(result.rows[0]);
}

export async function listNotificationChannelSettingsByChannelAndDestination(db, { channel, destination }) {
  const normalizedDestination = typeof destination === "string" ? destination.trim() : "";
  if (!normalizedDestination) {
    return [];
  }

  const result = await db.query(
    `
      SELECT id, user_id, channel, is_enabled, priority_order, destination, created_at, updated_at
      FROM notification_channel_settings
      WHERE channel = $1
        AND destination = $2
    `,
    [channel, normalizedDestination]
  );

  return result.rows.map(toSettingModel);
}

export async function upsertNotificationChannelSetting(
  db,
  { userId, channel, isEnabled = true, priorityOrder = 100, destination = "" }
) {
  const normalizedPriority = Number.isInteger(priorityOrder) ? priorityOrder : Number.parseInt(priorityOrder, 10) || 100;
  const normalizedDestination = typeof destination === "string" ? destination.trim() : "";

  const result = await db.query(
    `
      INSERT INTO notification_channel_settings (user_id, channel, is_enabled, priority_order, destination)
      VALUES ($1::uuid, $2, $3, $4, $5)
      ON CONFLICT (user_id, channel)
      DO UPDATE
      SET
        is_enabled = EXCLUDED.is_enabled,
        priority_order = EXCLUDED.priority_order,
        destination = EXCLUDED.destination,
        updated_at = NOW()
      RETURNING id, user_id, channel, is_enabled, priority_order, destination, created_at, updated_at
    `,
    [userId, channel, Boolean(isEnabled), normalizedPriority, normalizedDestination || null]
  );

  return toSettingModel(result.rows[0]);
}
