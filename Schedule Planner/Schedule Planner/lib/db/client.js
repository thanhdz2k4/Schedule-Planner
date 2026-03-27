import { Pool } from "pg";
import { resolveDatabaseUrl, shouldUseSupabaseSsl, stripSslModeFromDatabaseUrl } from "@/lib/db/env";

let pool;

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
