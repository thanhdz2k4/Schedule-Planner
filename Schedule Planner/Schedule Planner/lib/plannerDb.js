import { syncGoalProgress } from "@/lib/plannerStore";
import { Pool } from "pg";

let pool;
let schemaReady;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Thiếu DATABASE_URL để kết nối Postgres.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  return pool;
}

function normalizeStateShape(input) {
  const normalized = {
    tasks: Array.isArray(input?.tasks) ? input.tasks : [],
    goals: Array.isArray(input?.goals) ? input.goals : [],
  };

  syncGoalProgress(normalized);
  return normalized;
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(`
        CREATE TABLE IF NOT EXISTS planner_states (
          id SMALLINT PRIMARY KEY CHECK (id = 1),
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      .catch((error) => {
        schemaReady = undefined;
        throw error;
      });
  }

  return schemaReady;
}

export async function readPlannerState() {
  await ensureSchema();
  const db = getPool();
  const existing = await db.query("SELECT data FROM planner_states WHERE id = 1");

  if (!existing.rowCount) {
    return null;
  }

  return normalizeStateShape(existing.rows[0].data);
}

export async function writePlannerState(input) {
  await ensureSchema();
  const db = getPool();
  const normalized = normalizeStateShape(input);

  await db.query(
    `
      INSERT INTO planner_states (id, data, updated_at)
      VALUES (1, $1::jsonb, NOW())
      ON CONFLICT (id)
      DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `,
    [JSON.stringify(normalized)]
  );

  return normalized;
}
