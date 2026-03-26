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

function toConnectionModel(row) {
  return {
    id: row.id,
    userId: row.user_id,
    integrationId: row.integration_id,
    connectionId: row.connection_id,
    provider: row.provider || "",
    status: row.status,
    lastError: row.last_error || "",
    connectedAt: toIsoDateTime(row.connected_at),
    updatedAt: toIsoDateTime(row.updated_at),
  };
}

export async function listIntegrationConnectionsByUser(db, userId) {
  const result = await db.query(
    `
      SELECT id, user_id, integration_id, connection_id, provider, status, last_error, connected_at, updated_at
      FROM integration_connections
      WHERE user_id = $1::uuid
      ORDER BY integration_id ASC
    `,
    [userId]
  );

  return result.rows.map(toConnectionModel);
}

export async function getIntegrationConnectionByUser(db, userId, integrationId) {
  const result = await db.query(
    `
      SELECT id, user_id, integration_id, connection_id, provider, status, last_error, connected_at, updated_at
      FROM integration_connections
      WHERE user_id = $1::uuid
        AND integration_id = $2
      LIMIT 1
    `,
    [userId, integrationId]
  );

  if (!result.rowCount) {
    return null;
  }

  return toConnectionModel(result.rows[0]);
}

export async function upsertIntegrationConnection(
  db,
  { userId, integrationId, connectionId, provider = "", status = "active", lastError = "" }
) {
  const result = await db.query(
    `
      INSERT INTO integration_connections (
        user_id, integration_id, connection_id, provider, status, last_error, connected_at
      )
      VALUES ($1::uuid, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (user_id, integration_id)
      DO UPDATE
      SET
        connection_id = EXCLUDED.connection_id,
        provider = EXCLUDED.provider,
        status = EXCLUDED.status,
        last_error = EXCLUDED.last_error,
        connected_at = CASE
          WHEN EXCLUDED.status = 'active' THEN NOW()
          ELSE integration_connections.connected_at
        END,
        updated_at = NOW()
      RETURNING id, user_id, integration_id, connection_id, provider, status, last_error, connected_at, updated_at
    `,
    [userId, integrationId, connectionId, provider, status, lastError || null]
  );

  return toConnectionModel(result.rows[0]);
}
