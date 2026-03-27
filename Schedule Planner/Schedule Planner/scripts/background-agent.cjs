const { Pool } = require("pg");

const NON_ADVANCE_STATUSES = new Set([401, 403, 429, 500, 502, 503, 504]);
const TELEGRAM_ALLOWED_UPDATES = [
  "message",
  "edited_message",
  "channel_post",
  "edited_channel_post",
  "callback_query",
];

function readTextEnv(name, fallback = "") {
  const value = process.env[name];
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
}

function readBoolEnv(name, fallback) {
  const value = readTextEnv(name, "");
  if (!value) {
    return fallback;
  }

  if (/^(1|true|yes|on)$/i.test(value)) {
    return true;
  }

  if (/^(0|false|no|off)$/i.test(value)) {
    return false;
  }

  return fallback;
}

function readIntEnv(name, fallback, { min = null, max = null } = {}) {
  const parsed = Number.parseInt(readTextEnv(name, ""), 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  if (Number.isInteger(min) && parsed < min) {
    return min;
  }

  if (Number.isInteger(max) && parsed > max) {
    return max;
  }

  return parsed;
}

function normalizeBaseUrl(value, fallback) {
  const raw = readTextEnv(value, fallback);
  return raw.replace(/\/+$/, "");
}

function normalizePath(name, fallback) {
  const raw = readTextEnv(name, fallback);
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function pickEnv(...names) {
  for (const name of names) {
    const value = readTextEnv(name, "");
    if (value) {
      return value;
    }
  }

  return "";
}

function resolveDatabaseUrl() {
  const candidates = [
    pickEnv("DATABASE_URL"),
    pickEnv("schedule_POSTGRES_URL_NON_POOLING", "SCHEDULE_POSTGRES_URL_NON_POOLING"),
    pickEnv("schedule_POSTGRES_URL", "SCHEDULE_POSTGRES_URL"),
    pickEnv("POSTGRES_URL_NON_POOLING"),
    pickEnv("POSTGRES_URL"),
    pickEnv("schedule_POSTGRES_PRISMA_URL", "SCHEDULE_POSTGRES_PRISMA_URL"),
    pickEnv("POSTGRES_PRISMA_URL"),
  ];

  for (const value of candidates) {
    if (value) {
      return value;
    }
  }

  const host = pickEnv("schedule_POSTGRES_HOST", "SCHEDULE_POSTGRES_HOST", "POSTGRES_HOST");
  const database = pickEnv("schedule_POSTGRES_DATABASE", "SCHEDULE_POSTGRES_DATABASE", "POSTGRES_DATABASE");
  const user = pickEnv("schedule_POSTGRES_USER", "SCHEDULE_POSTGRES_USER", "POSTGRES_USER");
  const password = pickEnv("schedule_POSTGRES_PASSWORD", "SCHEDULE_POSTGRES_PASSWORD", "POSTGRES_PASSWORD");
  const port = pickEnv("schedule_POSTGRES_PORT", "SCHEDULE_POSTGRES_PORT", "POSTGRES_PORT") || "5432";

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

function summarizePayload(payload) {
  try {
    return JSON.stringify(payload);
  } catch {
    return "";
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function normalizeTelegramUpdates(payload) {
  const candidates = [
    payload?.result,
    payload?.data?.result,
    payload?.body?.result,
    payload?.payload?.result,
  ];

  const updates = candidates.find((item) => Array.isArray(item));
  if (!updates) {
    return [];
  }

  return updates
    .filter((item) => item && typeof item === "object" && Number.isInteger(item.update_id))
    .sort((left, right) => left.update_id - right.update_id);
}

function shouldAdvanceOffset(status) {
  return !NON_ADVANCE_STATUSES.has(status);
}

const config = {
  appBaseUrl: normalizeBaseUrl("SCHEDULER_APP_BASE_URL", "http://app:3000"),
  schedulerToken: readTextEnv("INTERNAL_SCHEDULER_TOKEN", ""),
  reminderEnabled: readBoolEnv("REMINDER_SCHEDULER_ENABLED", true),
  reminderIntervalMs: readIntEnv("REMINDER_DISPATCH_INTERVAL_MS", 5000, { min: 1000, max: 60000 }),
  reminderDispatchLimit: readIntEnv("REMINDER_DISPATCH_LIMIT", 20, { min: 1, max: 200 }),
  telegramPollEnabled: readBoolEnv("TELEGRAM_POLL_ENABLED", true),
  telegramPollIntervalMs: readIntEnv("TELEGRAM_POLL_INTERVAL_MS", 1500, { min: 500, max: 60000 }),
  telegramPollBatchLimit: readIntEnv("TELEGRAM_POLL_BATCH_LIMIT", 20, { min: 1, max: 100 }),
  nangoBaseUrl: normalizeBaseUrl("NANGO_BASE_URL", "https://api.nango.dev"),
  nangoSecretKey: readTextEnv("NANGO_SECRET_KEY", ""),
  nangoIntegrationTelegram: readTextEnv("NANGO_INTEGRATION_TELEGRAM", ""),
  nangoTelegramUpdatesPath: normalizePath("NANGO_TELEGRAM_UPDATES_PATH", "/proxy/getUpdates"),
  nangoTelegramDeleteWebhookPath: normalizePath("NANGO_TELEGRAM_DELETE_WEBHOOK_PATH", "/proxy/deleteWebhook"),
  telegramPollDeleteWebhookOnConflict: readBoolEnv("TELEGRAM_POLL_DELETE_WEBHOOK_ON_CONFLICT", true),
  telegramWebhookSecretToken: readTextEnv("TELEGRAM_WEBHOOK_SECRET_TOKEN", ""),
  databaseUrl: resolveDatabaseUrl(),
};

if (!config.databaseUrl) {
  console.error("[scheduler] DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: shouldUseSupabaseSsl(config.databaseUrl)
    ? stripSslModeFromDatabaseUrl(config.databaseUrl)
    : config.databaseUrl,
  ssl: shouldUseSupabaseSsl(config.databaseUrl) ? { rejectUnauthorized: false } : undefined,
  max: 4,
  idleTimeoutMillis: 10000,
});

let reminderInFlight = false;
let telegramPollInFlight = false;
const offsetsByConnection = new Map();
const warnedKeys = new Set();

function warnOnce(key, message) {
  if (warnedKeys.has(key)) {
    return;
  }

  warnedKeys.add(key);
  console.warn(`[scheduler] ${message}`);
}

async function dispatchRemindersTick() {
  if (!config.reminderEnabled) {
    return;
  }

  if (!config.schedulerToken) {
    warnOnce(
      "missing_scheduler_token",
      "Skipping reminder dispatch because INTERNAL_SCHEDULER_TOKEN is empty."
    );
    return;
  }

  if (reminderInFlight) {
    return;
  }
  reminderInFlight = true;

  try {
    const response = await fetch(`${config.appBaseUrl}/api/internal/reminders/dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-scheduler-token": config.schedulerToken,
      },
      body: JSON.stringify({ limit: config.reminderDispatchLimit }),
    });

    const payload = await safeJson(response);
    if (!response.ok) {
      console.error(
        `[scheduler] Reminder dispatch failed (${response.status}): ${summarizePayload(payload) || "no-body"}`
      );
      return;
    }

    const summary = payload?.summary || {};
    const sent = Number.parseInt(summary.sent, 10) || 0;
    const retried = Number.parseInt(summary.retried, 10) || 0;
    const failed = Number.parseInt(summary.failed, 10) || 0;
    const canceled = Number.parseInt(summary.canceled, 10) || 0;
    if (sent || retried || failed || canceled) {
      console.log(
        `[scheduler] Reminder dispatch scanned=${summary.scanned || 0}, sent=${sent}, retried=${retried}, failed=${failed}, canceled=${canceled}`
      );
    }
  } catch (error) {
    console.error(
      `[scheduler] Reminder dispatch request error: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    reminderInFlight = false;
  }
}

async function listActiveTelegramConnections() {
  const result = await pool.query(
    `
      SELECT connection_id
      FROM integration_connections
      WHERE integration_id = 'telegram'
        AND status = 'active'
        AND connection_id IS NOT NULL
        AND btrim(connection_id) <> ''
      ORDER BY connected_at DESC
    `
  );

  return result.rows
    .map((row) => (typeof row.connection_id === "string" ? row.connection_id.trim() : ""))
    .filter(Boolean);
}

async function fetchTelegramUpdates(connectionId, offset) {
  const payload = {
    limit: config.telegramPollBatchLimit,
    timeout: 0,
    allowed_updates: TELEGRAM_ALLOWED_UPDATES,
  };
  if (Number.isInteger(offset) && offset > 0) {
    payload.offset = offset;
  }

  const response = await fetch(`${config.nangoBaseUrl}${config.nangoTelegramUpdatesPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.nangoSecretKey}`,
      "Provider-Config-Key": config.nangoIntegrationTelegram,
      "Connection-Id": connectionId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await safeJson(response);
  if (!response.ok) {
    const detail = summarizePayload(body) || "no-body";
    const error = new Error(`Nango getUpdates failed (${response.status}) for ${connectionId}: ${detail}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return normalizeTelegramUpdates(body);
}

function isWebhookConflictError(error) {
  if (!error || error.status !== 409) {
    return false;
  }

  const message = summarizePayload(error.body).toLowerCase();
  return message.includes("getupdates") && message.includes("webhook is active");
}

async function deleteTelegramWebhook(connectionId) {
  const response = await fetch(`${config.nangoBaseUrl}${config.nangoTelegramDeleteWebhookPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.nangoSecretKey}`,
      "Provider-Config-Key": config.nangoIntegrationTelegram,
      "Connection-Id": connectionId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ drop_pending_updates: false }),
  });

  const body = await safeJson(response);
  if (!response.ok) {
    const detail = summarizePayload(body) || "no-body";
    throw new Error(`Nango deleteWebhook failed (${response.status}) for ${connectionId}: ${detail}`);
  }
}

async function forwardTelegramUpdate(connectionId, update) {
  const headers = {
    "Content-Type": "application/json",
  };
  if (config.telegramWebhookSecretToken) {
    headers["x-telegram-bot-api-secret-token"] = config.telegramWebhookSecretToken;
  }

  const response = await fetch(`${config.appBaseUrl}/api/chat/telegram/webhook`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      connectionId,
      ...update,
    }),
  });

  const body = await safeJson(response);
  return {
    status: response.status,
    payload: body,
  };
}

async function pollTelegramTick() {
  if (!config.telegramPollEnabled) {
    return;
  }

  if (!config.nangoSecretKey || !config.nangoIntegrationTelegram) {
    warnOnce(
      "missing_telegram_poll_config",
      "Skipping Telegram polling because NANGO_SECRET_KEY or NANGO_INTEGRATION_TELEGRAM is empty."
    );
    return;
  }

  if (telegramPollInFlight) {
    return;
  }
  telegramPollInFlight = true;

  try {
    const connectionIds = await listActiveTelegramConnections();
    for (const connectionId of connectionIds) {
      const offset = offsetsByConnection.get(connectionId) || 0;
      let updates;
      try {
        updates = await fetchTelegramUpdates(connectionId, offset);
      } catch (error) {
        if (config.telegramPollDeleteWebhookOnConflict && isWebhookConflictError(error)) {
          try {
            await deleteTelegramWebhook(connectionId);
            updates = await fetchTelegramUpdates(connectionId, offset);
            console.warn(`[scheduler] Webhook was active for ${connectionId}, switched this bot to polling mode.`);
          } catch (deleteWebhookError) {
            console.error(
              `[scheduler] ${deleteWebhookError instanceof Error ? deleteWebhookError.message : String(deleteWebhookError)}`
            );
            continue;
          }
        } else {
          console.error(`[scheduler] ${error instanceof Error ? error.message : String(error)}`);
          continue;
        }
      }

      if (!updates) {
        continue;
      }

      if (!updates.length) {
        continue;
      }

      let maxAcknowledged = null;
      for (const update of updates) {
        const result = await forwardTelegramUpdate(connectionId, update);
        if (result.status >= 200 && shouldAdvanceOffset(result.status)) {
          maxAcknowledged = update.update_id;
          continue;
        }

        console.error(
          `[scheduler] Webhook forward failed (${result.status}) for connection=${connectionId}, update_id=${update.update_id}: ${
            summarizePayload(result.payload) || "no-body"
          }`
        );
        break;
      }

      if (Number.isInteger(maxAcknowledged)) {
        offsetsByConnection.set(connectionId, maxAcknowledged + 1);
      }
    }
  } catch (error) {
    console.error(`[scheduler] Telegram polling error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    telegramPollInFlight = false;
  }
}

async function closeResourcesAndExit(code) {
  try {
    await pool.end();
  } catch {}
  process.exit(code);
}

process.on("SIGINT", () => {
  console.log("[scheduler] Received SIGINT, shutting down.");
  void closeResourcesAndExit(0);
});

process.on("SIGTERM", () => {
  console.log("[scheduler] Received SIGTERM, shutting down.");
  void closeResourcesAndExit(0);
});

console.log(
  `[scheduler] Started. reminder_interval_ms=${config.reminderIntervalMs}, telegram_poll_interval_ms=${config.telegramPollIntervalMs}`
);

void dispatchRemindersTick();
void pollTelegramTick();

setInterval(() => {
  void dispatchRemindersTick();
}, config.reminderIntervalMs);

setInterval(() => {
  void pollTelegramTick();
}, config.telegramPollIntervalMs);
