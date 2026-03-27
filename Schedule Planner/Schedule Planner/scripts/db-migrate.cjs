const { Pool } = require("pg");
const fs = require("node:fs/promises");
const path = require("node:path");

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");
const MIGRATION_LOCK_KEY = 391287412;

function sanitizeEnvValue(value) {
  let normalized = value.trim();

  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }

  while (normalized.startsWith("\uFEFF")) {
    normalized = normalized.slice(1);
  }

  while (normalized.startsWith("ï»¿")) {
    normalized = normalized.slice(3);
  }

  normalized = normalized.replace(/(?:\\r|\\n)+$/g, "").trim();

  return normalized.trim();
}

function readText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return sanitizeEnvValue(value);
}

function pickEnv(env, ...names) {
  for (const name of names) {
    const value = readText(env[name]);
    if (value) {
      return value;
    }
  }

  return "";
}

function resolveDatabaseUrl(env = process.env) {
  const candidates = [
    pickEnv(env, "schedule_POSTGRES_URL_NON_POOLING", "SCHEDULE_POSTGRES_URL_NON_POOLING"),
    pickEnv(env, "POSTGRES_URL_NON_POOLING"),
    pickEnv(env, "DATABASE_URL"),
    pickEnv(env, "schedule_POSTGRES_URL", "SCHEDULE_POSTGRES_URL"),
    pickEnv(env, "POSTGRES_URL"),
    pickEnv(env, "schedule_POSTGRES_PRISMA_URL", "SCHEDULE_POSTGRES_PRISMA_URL"),
    pickEnv(env, "POSTGRES_PRISMA_URL"),
  ];

  for (const value of candidates) {
    if (!value) {
      continue;
    }

    try {
      const parsed = new URL(value);
      if (parsed.protocol === "postgres:" || parsed.protocol === "postgresql:") {
        return value;
      }
    } catch {
      continue;
    }
  }

  const host = pickEnv(env, "schedule_POSTGRES_HOST", "SCHEDULE_POSTGRES_HOST", "POSTGRES_HOST");
  const database = pickEnv(env, "schedule_POSTGRES_DATABASE", "SCHEDULE_POSTGRES_DATABASE", "POSTGRES_DATABASE");
  const user = pickEnv(env, "schedule_POSTGRES_USER", "SCHEDULE_POSTGRES_USER", "POSTGRES_USER");
  const password = pickEnv(env, "schedule_POSTGRES_PASSWORD", "SCHEDULE_POSTGRES_PASSWORD", "POSTGRES_PASSWORD");
  const port = pickEnv(env, "schedule_POSTGRES_PORT", "SCHEDULE_POSTGRES_PORT", "POSTGRES_PORT") || "5432";

  if (!host || !database || !user || !password) {
    return "";
  }

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

function shouldUseSupabaseSsl(databaseUrl) {
  if (!databaseUrl) {
    return false;
  }

  try {
    const parsed = new URL(databaseUrl);
    const host = (parsed.hostname || "").toLowerCase();
    const mode = (parsed.searchParams.get("sslmode") || "").toLowerCase();
    return host.includes("supabase.co") || mode === "require" || mode === "verify-ca" || mode === "verify-full";
  } catch {
    return false;
  }
}

function stripSslModeFromDatabaseUrl(databaseUrl) {
  if (!databaseUrl) {
    return databaseUrl;
  }

  try {
    const parsed = new URL(databaseUrl);
    parsed.searchParams.delete("sslmode");
    return parsed.toString();
  } catch {
    return databaseUrl;
  }
}

async function listMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function hasAppliedMigration(client, filename) {
  const result = await client.query("SELECT 1 FROM schema_migrations WHERE filename = $1", [filename]);
  return result.rowCount > 0;
}

async function applyMigration(client, filename) {
  const filePath = path.join(MIGRATIONS_DIR, filename);
  const sql = await fs.readFile(filePath, "utf8");
  await client.query(sql);
  await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
}

async function run() {
  const databaseUrl = resolveDatabaseUrl(process.env);
  if (!databaseUrl) {
    throw new Error(
      "Missing DATABASE_URL. Set DATABASE_URL or schedule_POSTGRES_URL_NON_POOLING / schedule_POSTGRES_URL."
    );
  }

  const useSsl = shouldUseSupabaseSsl(databaseUrl);
  const connectionString = useSsl ? stripSslModeFromDatabaseUrl(databaseUrl) : databaseUrl;
  const pool = new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });

  const client = await pool.connect();
  let applied = 0;

  try {
    console.log("[migrate] acquiring advisory lock...");
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    console.log("[migrate] advisory lock acquired");
    await client.query("SET statement_timeout = 0");
    await client.query("SET lock_timeout = 0");
    console.log("[migrate] preparing schema_migrations table...");
    await ensureMigrationTable(client);

    const files = await listMigrationFiles();
    console.log(`[migrate] found ${files.length} migration file(s)`);
    for (const filename of files) {
      console.log(`[migrate] checking ${filename}`);
      const alreadyApplied = await hasAppliedMigration(client, filename);
      if (alreadyApplied) {
        continue;
      }

      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL statement_timeout = 0");
        await client.query("SET LOCAL lock_timeout = 0");
        console.log(`[migrate] applying ${filename}...`);
        await applyMigration(client, filename);
        await client.query("COMMIT");
        applied += 1;
        console.log(`[migrate] applied ${filename}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Failed migration ${filename}: ${error.message}`);
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => {});
    client.release();
    await pool.end();
  }

  if (!applied) {
    console.log("[migrate] no pending migrations");
  }
}

run().catch((error) => {
  console.error(`[migrate] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
