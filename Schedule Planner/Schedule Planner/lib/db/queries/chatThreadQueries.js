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

function parseContext(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {}
  }

  return null;
}

function toThreadModel(row) {
  return {
    id: row.id,
    userId: row.user_id,
    channel: row.channel,
    externalChatId: row.external_chat_id,
    title: row.title || "",
    context: parseContext(row.context_json),
    lastMessageAt: toIsoDateTime(row.last_message_at),
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  };
}

function toThreadSummaryModel(row) {
  const base = toThreadModel(row);
  return {
    ...base,
    lastMessage: {
      content: row.last_message_content || "",
      role: row.last_message_role || "",
      createdAt: toIsoDateTime(row.last_message_created_at),
    },
  };
}

function toMessageModel(row) {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    direction: row.direction,
    content: row.content,
    externalMessageId: row.external_message_id || "",
    rawPayload: row.raw_payload || null,
    createdAt: toIsoDateTime(row.created_at),
  };
}

const THREAD_SELECT_COLUMNS =
  "id, user_id, channel, external_chat_id, title, context_json, last_message_at, created_at, updated_at";
const THREAD_SELECT_COLUMNS_WITH_ALIAS = THREAD_SELECT_COLUMNS.split(", ")
  .map((column) => `t.${column}`)
  .join(", ");
const MESSAGE_SELECT_COLUMNS =
  "id, thread_id, role, direction, content, external_message_id, raw_payload, created_at";

export async function getChatThreadByUserAndExternalChatId(db, { userId, channel, externalChatId }) {
  const result = await db.query(
    `
      SELECT ${THREAD_SELECT_COLUMNS}
      FROM chat_threads
      WHERE user_id = $1::uuid
        AND channel = $2
        AND external_chat_id = $3
      LIMIT 1
    `,
    [userId, channel, externalChatId]
  );

  if (!result.rowCount) {
    return null;
  }

  return toThreadModel(result.rows[0]);
}

export async function getChatThreadByIdAndUser(db, { userId, threadId }) {
  const result = await db.query(
    `
      SELECT ${THREAD_SELECT_COLUMNS}
      FROM chat_threads
      WHERE id = $1::uuid
        AND user_id = $2::uuid
      LIMIT 1
    `,
    [threadId, userId]
  );

  if (!result.rowCount) {
    return null;
  }

  return toThreadModel(result.rows[0]);
}

export async function upsertChatThreadByUserAndExternalChatId(
  db,
  { userId, channel, externalChatId, title = "", lastMessageAt = new Date() }
) {
  const normalizedTitle = typeof title === "string" ? title.trim() : "";
  const result = await db.query(
    `
      INSERT INTO chat_threads (user_id, channel, external_chat_id, title, last_message_at)
      VALUES ($1::uuid, $2, $3, $4, $5::timestamptz)
      ON CONFLICT (user_id, channel, external_chat_id)
      DO UPDATE
      SET
        title = CASE
          WHEN EXCLUDED.title IS NULL OR EXCLUDED.title = '' THEN chat_threads.title
          ELSE EXCLUDED.title
        END,
        last_message_at = GREATEST(chat_threads.last_message_at, EXCLUDED.last_message_at),
        updated_at = NOW()
      RETURNING ${THREAD_SELECT_COLUMNS}
    `,
    [userId, channel, externalChatId, normalizedTitle || null, lastMessageAt]
  );

  return toThreadModel(result.rows[0]);
}

export async function updateChatThreadContext(db, { threadId, context, lastMessageAt = null }) {
  const contextPayload =
    context && typeof context === "object" && !Array.isArray(context) ? context : null;

  const result = await db.query(
    `
      UPDATE chat_threads
      SET
        context_json = $2::jsonb,
        last_message_at = COALESCE($3::timestamptz, last_message_at),
        updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING ${THREAD_SELECT_COLUMNS}
    `,
    [threadId, contextPayload ? JSON.stringify(contextPayload) : null, lastMessageAt]
  );

  if (!result.rowCount) {
    return null;
  }

  return toThreadModel(result.rows[0]);
}

export async function insertChatMessage(
  db,
  { threadId, role, direction, content, externalMessageId = "", rawPayload = null }
) {
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) {
    throw new Error("Chat message content is required.");
  }

  const payload =
    rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload) ? rawPayload : null;

  const result = await db.query(
    `
      INSERT INTO chat_messages (thread_id, role, direction, content, external_message_id, raw_payload)
      VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)
      RETURNING ${MESSAGE_SELECT_COLUMNS}
    `,
    [threadId, role, direction, text, externalMessageId || null, payload ? JSON.stringify(payload) : null]
  );

  return toMessageModel(result.rows[0]);
}

export async function listChatThreadsByUser(db, { userId, limit = 30, offset = 0 }) {
  const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(200, limit)) : 30;
  const safeOffset = Number.isInteger(offset) ? Math.max(0, offset) : 0;

  const result = await db.query(
    `
      SELECT
        ${THREAD_SELECT_COLUMNS_WITH_ALIAS},
        lm.content AS last_message_content,
        lm.role AS last_message_role,
        lm.created_at AS last_message_created_at
      FROM chat_threads t
      LEFT JOIN LATERAL (
        SELECT content, role, created_at
        FROM chat_messages
        WHERE thread_id = t.id
        ORDER BY created_at DESC
        LIMIT 1
      ) lm ON TRUE
      WHERE t.user_id = $1::uuid
      ORDER BY t.last_message_at DESC
      LIMIT $2
      OFFSET $3
    `,
    [userId, safeLimit, safeOffset]
  );

  return result.rows.map(toThreadSummaryModel);
}

export async function listChatMessagesByThread(db, { threadId, limit = 200 }) {
  const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(1000, limit)) : 200;

  const result = await db.query(
    `
      SELECT ${MESSAGE_SELECT_COLUMNS}
      FROM chat_messages
      WHERE thread_id = $1::uuid
      ORDER BY created_at ASC
      LIMIT $2
    `,
    [threadId, safeLimit]
  );

  return result.rows.map(toMessageModel);
}
