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

function normalizeConfidence(value, fallback = 0.7) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, parsed));
}

function toMemoryFactModel(row) {
  return {
    id: row.id,
    userId: row.user_id,
    factType: row.fact_type,
    factKey: row.fact_key,
    factValue: row.fact_value,
    confidence: Number(row.confidence),
    source: row.source || "chat",
    lastSeenAt: toIsoDateTime(row.last_seen_at),
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  };
}

const MEMORY_FACT_SELECT_COLUMNS =
  "id, user_id, fact_type, fact_key, fact_value, confidence, source, last_seen_at, created_at, updated_at";

export async function listUserMemoryFacts(
  db,
  { userId, factType = "", limit = 100 }
) {
  const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(500, limit)) : 100;
  const normalizedFactType = typeof factType === "string" ? factType.trim() : "";

  const params = [userId, safeLimit];
  let factTypeClause = "";
  if (normalizedFactType) {
    params.push(normalizedFactType);
    factTypeClause = `AND fact_type = $${params.length}`;
  }

  const result = await db.query(
    `
      SELECT ${MEMORY_FACT_SELECT_COLUMNS}
      FROM user_memory_facts
      WHERE user_id = $1::uuid
        ${factTypeClause}
      ORDER BY confidence DESC, last_seen_at DESC, updated_at DESC
      LIMIT $2
    `,
    params
  );

  return result.rows.map(toMemoryFactModel);
}

export async function getUserMemoryFactById(db, { userId, factId }) {
  const result = await db.query(
    `
      SELECT ${MEMORY_FACT_SELECT_COLUMNS}
      FROM user_memory_facts
      WHERE id = $1::uuid
        AND user_id = $2::uuid
      LIMIT 1
    `,
    [factId, userId]
  );

  if (!result.rowCount) {
    return null;
  }

  return toMemoryFactModel(result.rows[0]);
}

export async function upsertUserMemoryFact(
  db,
  { userId, factType, factKey, factValue, confidence = 0.7, source = "chat" }
) {
  const normalizedFactType = typeof factType === "string" ? factType.trim() : "";
  const normalizedFactKey = typeof factKey === "string" ? factKey.trim() : "";
  const normalizedFactValue = typeof factValue === "string" ? factValue.trim() : "";
  const normalizedSource = typeof source === "string" && source.trim() ? source.trim() : "chat";
  const normalizedConfidence = normalizeConfidence(confidence);

  if (!normalizedFactType || !normalizedFactKey || !normalizedFactValue) {
    throw new Error("factType, factKey, factValue are required.");
  }

  const result = await db.query(
    `
      INSERT INTO user_memory_facts (
        user_id, fact_type, fact_key, fact_value, confidence, source, last_seen_at
      )
      VALUES ($1::uuid, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (user_id, fact_type, fact_key)
      DO UPDATE
      SET
        fact_value = EXCLUDED.fact_value,
        confidence = LEAST(1, GREATEST(EXCLUDED.confidence, user_memory_facts.confidence - 0.05)),
        source = EXCLUDED.source,
        last_seen_at = NOW(),
        updated_at = NOW()
      RETURNING ${MEMORY_FACT_SELECT_COLUMNS}
    `,
    [
      userId,
      normalizedFactType,
      normalizedFactKey,
      normalizedFactValue,
      normalizedConfidence,
      normalizedSource,
    ]
  );

  return toMemoryFactModel(result.rows[0]);
}

export async function deleteUserMemoryFactById(db, { userId, factId }) {
  const result = await db.query(
    `
      DELETE FROM user_memory_facts
      WHERE id = $1::uuid
        AND user_id = $2::uuid
      RETURNING id
    `,
    [factId, userId]
  );

  return result.rowCount > 0;
}

export async function insertMemoryEvent(
  db,
  { userId, eventType, payload = null }
) {
  const normalizedEventType = typeof eventType === "string" ? eventType.trim() : "";
  if (!normalizedEventType) {
    throw new Error("eventType is required.");
  }

  const safePayload =
    payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;

  await db.query(
    `
      INSERT INTO memory_events (user_id, event_type, payload)
      VALUES ($1::uuid, $2, $3::jsonb)
    `,
    [userId, normalizedEventType, safePayload ? JSON.stringify(safePayload) : null]
  );
}
