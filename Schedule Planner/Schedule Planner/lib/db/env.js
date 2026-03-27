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

export function resolveDatabaseUrl(env = process.env) {
  const candidates = [
    pickEnv(env, "DATABASE_URL"),
    pickEnv(env, "schedule_POSTGRES_URL_NON_POOLING", "SCHEDULE_POSTGRES_URL_NON_POOLING"),
    pickEnv(env, "schedule_POSTGRES_URL", "SCHEDULE_POSTGRES_URL"),
    pickEnv(env, "POSTGRES_URL_NON_POOLING"),
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

export function shouldUseSupabaseSsl(databaseUrl) {
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

export function stripSslModeFromDatabaseUrl(databaseUrl) {
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
