import { Pool } from "pg";
import { resolveDatabaseUrl, shouldUseSupabaseSsl, stripSslModeFromDatabaseUrl } from "@/lib/db/env";

let pool;

function parsePositiveInt(rawValue, fallbackValue) {
  const parsed = Number.parseInt(String(rawValue || ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallbackValue;
}

function resolvePoolMax(env = process.env) {
  const defaultMax = env.VERCEL === "1" ? 1 : 10;
  return parsePositiveInt(env.PG_POOL_MAX, defaultMax);
}

export function getPool() {
  const databaseUrl = resolveDatabaseUrl(process.env);
  if (!databaseUrl) {
    throw new Error("Thieu DATABASE_URL (hoac bien schedule_POSTGRES_URL) de ket noi Postgres.");
  }

  if (!pool) {
    const useSsl = shouldUseSupabaseSsl(databaseUrl);
    const connectionString = useSsl ? stripSslModeFromDatabaseUrl(databaseUrl) : databaseUrl;
    pool = new Pool({
      connectionString,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      max: resolvePoolMax(process.env),
      idleTimeoutMillis: parsePositiveInt(process.env.PG_IDLE_TIMEOUT_MS, 10000),
      connectionTimeoutMillis: parsePositiveInt(process.env.PG_CONNECTION_TIMEOUT_MS, 10000),
    });
  }

  return pool;
}

export async function withTransaction(handler) {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const result = await handler(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
