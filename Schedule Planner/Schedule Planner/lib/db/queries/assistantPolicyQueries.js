const DEFAULT_POLICY_BY_ACTION = {
  daily_digest: "auto",
  conflict_alert: "auto",
  risk_alert: "auto",
  reschedule_chain: "ask",
  plan_week: "ask",
};

const VALID_POLICY_MODES = new Set(["auto", "ask", "deny"]);

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

function toPolicyModel(row) {
  return {
    id: row.id,
    userId: row.user_id,
    actionType: row.action_type,
    mode: row.mode,
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  };
}

export function listPolicyActionTypes() {
  return Object.keys(DEFAULT_POLICY_BY_ACTION);
}

export function resolveDefaultPolicyMode(actionType) {
  if (typeof actionType !== "string") {
    return "ask";
  }

  const key = actionType.trim();
  return DEFAULT_POLICY_BY_ACTION[key] || "ask";
}

export async function ensureDefaultAssistantPolicies(db, userId) {
  for (const [actionType, mode] of Object.entries(DEFAULT_POLICY_BY_ACTION)) {
    await db.query(
      `
        INSERT INTO assistant_policies (user_id, action_type, mode)
        VALUES ($1::uuid, $2, $3)
        ON CONFLICT (user_id, action_type) DO NOTHING
      `,
      [userId, actionType, mode]
    );
  }
}

export async function listAssistantPoliciesByUser(db, userId) {
  const result = await db.query(
    `
      SELECT id, user_id, action_type, mode, created_at, updated_at
      FROM assistant_policies
      WHERE user_id = $1::uuid
      ORDER BY action_type ASC
    `,
    [userId]
  );

  return result.rows.map(toPolicyModel);
}

export async function getAssistantPolicyMode(db, { userId, actionType }) {
  const normalizedActionType = typeof actionType === "string" ? actionType.trim() : "";
  if (!normalizedActionType) {
    return "ask";
  }

  const result = await db.query(
    `
      SELECT mode
      FROM assistant_policies
      WHERE user_id = $1::uuid
        AND action_type = $2
      LIMIT 1
    `,
    [userId, normalizedActionType]
  );

  if (!result.rowCount) {
    return resolveDefaultPolicyMode(normalizedActionType);
  }

  return result.rows[0].mode || resolveDefaultPolicyMode(normalizedActionType);
}

export async function upsertAssistantPolicy(db, { userId, actionType, mode }) {
  const normalizedActionType = typeof actionType === "string" ? actionType.trim() : "";
  const normalizedMode = typeof mode === "string" ? mode.trim() : "";
  if (!normalizedActionType) {
    throw new Error("actionType is required.");
  }

  if (!VALID_POLICY_MODES.has(normalizedMode)) {
    throw new Error("mode must be one of: auto, ask, deny.");
  }

  const result = await db.query(
    `
      INSERT INTO assistant_policies (user_id, action_type, mode)
      VALUES ($1::uuid, $2, $3)
      ON CONFLICT (user_id, action_type)
      DO UPDATE
      SET mode = EXCLUDED.mode,
          updated_at = NOW()
      RETURNING id, user_id, action_type, mode, created_at, updated_at
    `,
    [userId, normalizedActionType, normalizedMode]
  );

  return toPolicyModel(result.rows[0]);
}
