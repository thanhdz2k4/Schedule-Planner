const VALID_ACTION_STATUSES = new Set([
  "proposed",
  "pending_approval",
  "approved",
  "denied",
  "executing",
  "executed",
  "failed",
  "canceled",
]);

const VALID_ACTION_MODES = new Set(["auto", "ask", "deny"]);
const VALID_RISK_LEVELS = new Set(["low", "medium", "high"]);

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

function toActionModel(row) {
  return {
    id: row.id,
    userId: row.user_id,
    actionType: row.action_type,
    riskLevel: row.risk_level,
    mode: row.mode,
    status: row.status,
    title: row.title,
    summary: row.summary,
    payload: row.payload || null,
    dedupeKey: row.dedupe_key || "",
    sourceWorkflow: row.source_workflow || "",
    approvedBy: row.approved_by || "",
    approvedAt: toIsoDateTime(row.approved_at),
    executedAt: toIsoDateTime(row.executed_at),
    errorMessage: row.error_message || "",
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  };
}

const ACTION_SELECT_COLUMNS = `
  id,
  user_id,
  action_type,
  risk_level,
  mode,
  status,
  title,
  summary,
  payload,
  dedupe_key,
  source_workflow,
  approved_by,
  approved_at,
  executed_at,
  error_message,
  created_at,
  updated_at
`;

function normalizeMode(value) {
  const mode = typeof value === "string" ? value.trim() : "";
  if (!VALID_ACTION_MODES.has(mode)) {
    throw new Error("mode must be one of: auto, ask, deny.");
  }
  return mode;
}

function normalizeRiskLevel(value) {
  const level = typeof value === "string" ? value.trim() : "";
  if (!VALID_RISK_LEVELS.has(level)) {
    throw new Error("riskLevel must be one of: low, medium, high.");
  }
  return level;
}

function normalizeStatus(value) {
  const status = typeof value === "string" ? value.trim() : "";
  if (!VALID_ACTION_STATUSES.has(status)) {
    throw new Error("Invalid assistant action status.");
  }
  return status;
}

export async function createAssistantAction(
  db,
  {
    userId,
    actionType,
    riskLevel = "low",
    mode = "ask",
    status = "proposed",
    title,
    summary,
    payload = null,
    dedupeKey = "",
    sourceWorkflow = "",
  }
) {
  const normalizedActionType = typeof actionType === "string" ? actionType.trim() : "";
  const normalizedTitle = typeof title === "string" ? title.trim() : "";
  const normalizedSummary = typeof summary === "string" ? summary.trim() : "";
  const normalizedMode = normalizeMode(mode);
  const normalizedStatus = normalizeStatus(status);
  const normalizedRiskLevel = normalizeRiskLevel(riskLevel);
  const normalizedDedupeKey = typeof dedupeKey === "string" ? dedupeKey.trim() : "";
  const normalizedSourceWorkflow =
    typeof sourceWorkflow === "string" ? sourceWorkflow.trim() : "";

  if (!normalizedActionType || !normalizedTitle || !normalizedSummary) {
    throw new Error("actionType, title, summary are required.");
  }

  const safePayload = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;

  const result = await db.query(
    `
      INSERT INTO assistant_actions (
        user_id,
        action_type,
        risk_level,
        mode,
        status,
        title,
        summary,
        payload,
        dedupe_key,
        source_workflow
      )
      VALUES (
        $1::uuid,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8::jsonb,
        $9,
        $10
      )
      ON CONFLICT (user_id, dedupe_key)
      WHERE dedupe_key IS NOT NULL
      DO NOTHING
      RETURNING ${ACTION_SELECT_COLUMNS}
    `,
    [
      userId,
      normalizedActionType,
      normalizedRiskLevel,
      normalizedMode,
      normalizedStatus,
      normalizedTitle,
      normalizedSummary,
      safePayload ? JSON.stringify(safePayload) : null,
      normalizedDedupeKey || null,
      normalizedSourceWorkflow || null,
    ]
  );

  if (!result.rowCount) {
    if (!normalizedDedupeKey) {
      return null;
    }

    const existing = await db.query(
      `
        SELECT ${ACTION_SELECT_COLUMNS}
        FROM assistant_actions
        WHERE user_id = $1::uuid
          AND dedupe_key = $2
        LIMIT 1
      `,
      [userId, normalizedDedupeKey]
    );

    if (!existing.rowCount) {
      return null;
    }

    return toActionModel(existing.rows[0]);
  }

  return toActionModel(result.rows[0]);
}

export async function getAssistantActionByIdForUser(db, { userId, actionId }) {
  const result = await db.query(
    `
      SELECT ${ACTION_SELECT_COLUMNS}
      FROM assistant_actions
      WHERE id = $1::uuid
        AND user_id = $2::uuid
      LIMIT 1
    `,
    [actionId, userId]
  );

  if (!result.rowCount) {
    return null;
  }

  return toActionModel(result.rows[0]);
}

export async function getAssistantActionById(db, actionId) {
  const result = await db.query(
    `
      SELECT ${ACTION_SELECT_COLUMNS}
      FROM assistant_actions
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [actionId]
  );

  if (!result.rowCount) {
    return null;
  }

  return toActionModel(result.rows[0]);
}

export async function listAssistantActionsByUser(
  db,
  { userId, status = "", actionType = "", limit = 50, offset = 0 }
) {
  const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(200, limit)) : 50;
  const safeOffset = Number.isInteger(offset) ? Math.max(0, offset) : 0;
  const normalizedStatus = typeof status === "string" ? status.trim() : "";
  const normalizedActionType = typeof actionType === "string" ? actionType.trim() : "";

  const params = [userId, safeLimit, safeOffset];
  const conditions = ["user_id = $1::uuid"];

  if (normalizedStatus) {
    params.push(normalizedStatus);
    conditions.push(`status = $${params.length}`);
  }

  if (normalizedActionType) {
    params.push(normalizedActionType);
    conditions.push(`action_type = $${params.length}`);
  }

  const result = await db.query(
    `
      SELECT ${ACTION_SELECT_COLUMNS}
      FROM assistant_actions
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT $2
      OFFSET $3
    `,
    params
  );

  return result.rows.map(toActionModel);
}

export async function updateAssistantActionStatus(
  db,
  { actionId, status, errorMessage = "", approvedBy = "", approvedAt = null, executedAt = null }
) {
  const normalizedStatus = normalizeStatus(status);
  const normalizedErrorMessage = typeof errorMessage === "string" ? errorMessage.trim() : "";
  const normalizedApprovedBy = typeof approvedBy === "string" ? approvedBy.trim() : "";

  const result = await db.query(
    `
      UPDATE assistant_actions
      SET
        status = $2,
        error_message = CASE WHEN $3 = '' THEN NULL ELSE $3 END,
        approved_by = CASE WHEN $4 = '' THEN approved_by ELSE $4::uuid END,
        approved_at = COALESCE($5::timestamptz, approved_at),
        executed_at = COALESCE($6::timestamptz, executed_at),
        updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING ${ACTION_SELECT_COLUMNS}
    `,
    [
      actionId,
      normalizedStatus,
      normalizedErrorMessage,
      normalizedApprovedBy,
      approvedAt ? approvedAt.toISOString() : null,
      executedAt ? executedAt.toISOString() : null,
    ]
  );

  if (!result.rowCount) {
    return null;
  }

  return toActionModel(result.rows[0]);
}

export async function deleteAssistantActionByIdForUser(db, { userId, actionId }) {
  const result = await db.query(
    `
      DELETE FROM assistant_actions
      WHERE id = $1::uuid
        AND user_id = $2::uuid
      RETURNING ${ACTION_SELECT_COLUMNS}
    `,
    [actionId, userId]
  );

  if (!result.rowCount) {
    return null;
  }

  return toActionModel(result.rows[0]);
}
