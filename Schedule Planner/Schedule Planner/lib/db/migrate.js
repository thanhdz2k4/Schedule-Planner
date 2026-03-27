import { getPool } from "@/lib/db/client";
import fs from "node:fs/promises";
import path from "node:path";

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");
const MIGRATION_LOCK_KEY = 391287412;

let migrationsReady;

function parseBooleanToggle(rawValue) {
  const normalized = String(rawValue || "")
    .trim()
    .toLowerCase();

  if (!normalized) return null;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function shouldAutoRunMigrations(env = process.env) {
  const explicit = parseBooleanToggle(env.AUTO_RUN_MIGRATIONS ?? env.DB_AUTO_MIGRATE);
  if (explicit !== null) {
    return explicit;
  }

  return env.VERCEL !== "1";
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

async function runMigrationsInternal() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    await ensureMigrationTable(client);

    const files = await listMigrationFiles();
    for (const filename of files) {
      if (await hasAppliedMigration(client, filename)) {
        continue;
      }

      try {
        await client.query("BEGIN");
        await applyMigration(client, filename);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Khong the apply migration ${filename}: ${error.message}`);
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => {});
    client.release();
  }
}

export async function ensureMigrations() {
  if (!shouldAutoRunMigrations()) {
    return;
  }

  if (!migrationsReady) {
    migrationsReady = runMigrationsInternal().catch((error) => {
      migrationsReady = undefined;
      throw error;
    });
  }

  return migrationsReady;
}
