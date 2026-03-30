import "dotenv/config";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

function toNonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function parseIntOr(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function parseBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

const config = {
  port: parseIntOr(process.env.SKEDDY_RELAY_PORT, 8787, { min: 1, max: 65535 }),
  botUsername: toNonEmptyString(process.env.SKEDDY_BOT_USERNAME) || "@SkeddyBot",
  apiId: parseIntOr(process.env.TELEGRAM_API_ID, 0, { min: 1 }),
  apiHash: toNonEmptyString(process.env.TELEGRAM_API_HASH),
  sessionString: toNonEmptyString(process.env.TELEGRAM_SESSION_STRING),
  webhookSecret: toNonEmptyString(process.env.SKEDDY_RELAY_WEBHOOK_SECRET),
  dryRun: parseBool(process.env.SKEDDY_RELAY_DRY_RUN, false),
  sendDelayMs: parseIntOr(process.env.SKEDDY_RELAY_SEND_DELAY_MS, 300, { min: 0, max: 60000 }),
  allowedEvents: (toNonEmptyString(process.env.SKEDDY_RELAY_ALLOWED_EVENTS) || "planner_tasks_changed,planner_task_mutation")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  createTemplate: toNonEmptyString(process.env.SKEDDY_CMD_CREATE_TEMPLATE) || "{{title}} at {{date}} {{start}} {{tag}}",
  updateTemplate: toNonEmptyString(process.env.SKEDDY_CMD_UPDATE_TEMPLATE) || "{{title}} at {{date}} {{start}} {{tag}}",
  deleteTemplate: toNonEmptyString(process.env.SKEDDY_CMD_DELETE_TEMPLATE),
  sendDeleteBeforeUpdate: parseBool(process.env.SKEDDY_SEND_DELETE_BEFORE_UPDATE, false),
};

if (!config.apiId || !config.apiHash || !config.sessionString) {
  if (!config.dryRun) {
    console.error("Missing TELEGRAM_API_ID / TELEGRAM_API_HASH / TELEGRAM_SESSION_STRING.");
    process.exit(1);
  }
}

function sleep(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function verifySignature(rawBodyText, signatureHeader, secret) {
  if (!secret) {
    return true;
  }

  const signature = toNonEmptyString(signatureHeader);
  if (!signature) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(rawBodyText).digest("hex");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function templateData(task = {}) {
  return {
    id: toNonEmptyString(task.id),
    title: toNonEmptyString(task.title),
    date: toNonEmptyString(task.date),
    start: toNonEmptyString(task.start),
    end: toNonEmptyString(task.end),
    status: toNonEmptyString(task.status),
    priority: toNonEmptyString(task.priority),
    tag: toNonEmptyString(task.id) ? `#sp_${task.id}` : "",
  };
}

function renderTemplate(template, task) {
  const safeTemplate = toNonEmptyString(template);
  if (!safeTemplate) {
    return "";
  }

  const data = templateData(task);
  return safeTemplate.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => data[key] ?? "").trim();
}

function normalizeCommand(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.replace(/\s+/g, " ").trim();
}

function pushCommand(commands, command) {
  const normalized = normalizeCommand(command);
  if (!normalized) {
    return;
  }
  commands.push(normalized);
}

function buildCommandsFromPlannerChanged(eventPayload) {
  const commands = [];
  const tasks = eventPayload?.tasks || {};
  const created = Array.isArray(tasks.created) ? tasks.created : [];
  const updated = Array.isArray(tasks.updated) ? tasks.updated : [];
  const deleted = Array.isArray(tasks.deleted) ? tasks.deleted : [];

  for (const task of created) {
    pushCommand(commands, task?.skeddy_command || renderTemplate(config.createTemplate, task));
  }

  for (const item of updated) {
    const beforeTask = item?.before || null;
    const afterTask = item?.after || null;
    if (config.sendDeleteBeforeUpdate && config.deleteTemplate && beforeTask) {
      pushCommand(commands, renderTemplate(config.deleteTemplate, beforeTask));
    }
    pushCommand(
      commands,
      item?.skeddy_command || renderTemplate(config.updateTemplate, afterTask || beforeTask || {})
    );
  }

  for (const task of deleted) {
    if (!config.deleteTemplate) {
      continue;
    }
    pushCommand(commands, renderTemplate(config.deleteTemplate, task));
  }

  return commands;
}

function buildCommandsFromTaskMutation(eventPayload) {
  const commands = [];
  const action = toNonEmptyString(eventPayload?.action).toLowerCase();
  const task = eventPayload?.task || {};
  const beforeTask = task.before || {};
  const afterTask = task.after || {};
  const explicit = toNonEmptyString(task.skeddy_command);

  if (action === "delete") {
    if (config.deleteTemplate) {
      pushCommand(commands, renderTemplate(config.deleteTemplate, beforeTask));
    }
    return commands;
  }

  if (action === "create") {
    pushCommand(commands, explicit || renderTemplate(config.createTemplate, afterTask || beforeTask));
    return commands;
  }

  if (action === "update") {
    if (config.sendDeleteBeforeUpdate && config.deleteTemplate) {
      pushCommand(commands, renderTemplate(config.deleteTemplate, beforeTask));
    }
    pushCommand(commands, explicit || renderTemplate(config.updateTemplate, afterTask || beforeTask));
  }

  return commands;
}

function buildCommands(payload) {
  const eventType = toNonEmptyString(payload?.event_type);
  if (eventType === "planner_tasks_changed") {
    return buildCommandsFromPlannerChanged(payload);
  }
  if (eventType === "planner_task_mutation") {
    return buildCommandsFromTaskMutation(payload);
  }
  return [];
}

function dedupeCommands(commands) {
  return [...new Set(commands.map(normalizeCommand).filter(Boolean))];
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

let telegramClient = null;
let skeddyEntity = null;
let startupError = "";

async function sendCommands(commands) {
  if (!commands.length) {
    return;
  }

  for (const command of commands) {
    if (config.dryRun) {
      console.log(`[dry-run] ${command}`);
      continue;
    }
    await telegramClient.sendMessage(skeddyEntity, { message: command });
    await sleep(config.sendDelayMs);
  }
}

async function bootTelegram() {
  if (config.dryRun) {
    return;
  }

  telegramClient = new TelegramClient(new StringSession(config.sessionString), config.apiId, config.apiHash, {
    connectionRetries: 5,
  });
  await telegramClient.connect();
  const authorized = await telegramClient.checkAuthorization();
  if (!authorized) {
    throw new Error("Telegram session is not authorized. Generate a new TELEGRAM_SESSION_STRING.");
  }
  skeddyEntity = await telegramClient.getEntity(config.botUsername);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

async function handleWebhook(request, response) {
  if (startupError) {
    return sendJson(response, 503, { ok: false, message: startupError });
  }

  const rawBody = await readRequestBody(request);
  const isSigned = verifySignature(rawBody, request.headers["x-skeddy-signature"], config.webhookSecret);
  if (!isSigned) {
    return sendJson(response, 401, { ok: false, message: "Invalid webhook signature." });
  }

  let payload = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return sendJson(response, 400, { ok: false, message: "Invalid JSON payload." });
  }

  const eventType = toNonEmptyString(payload?.event_type);
  if (!eventType) {
    return sendJson(response, 400, { ok: false, message: "Missing event_type." });
  }

  if (!config.allowedEvents.includes(eventType)) {
    return sendJson(response, 202, {
      ok: true,
      accepted: false,
      reason: "event_not_allowed",
      event_type: eventType,
    });
  }

  const commands = dedupeCommands(buildCommands(payload));
  await sendCommands(commands);

  return sendJson(response, 200, {
    ok: true,
    event_type: eventType,
    command_count: commands.length,
    commands,
    dry_run: config.dryRun,
  });
}

async function main() {
  try {
    await bootTelegram();
    console.log(
      config.dryRun
        ? `Started in dry-run mode. Target bot: ${config.botUsername}`
        : `Connected to Telegram. Target bot: ${config.botUsername}`
    );
  } catch (error) {
    startupError = error instanceof Error ? error.message : String(error);
    console.error(`[startup] ${startupError}`);
  }

  const server = createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        return sendJson(response, startupError ? 503 : 200, {
          ok: !startupError,
          service: "skeddy-user-relay",
          dry_run: config.dryRun,
          startup_error: startupError || null,
        });
      }

      if (request.method === "POST" && request.url === "/webhook") {
        await handleWebhook(request, response);
        return;
      }

      sendJson(response, 404, { ok: false, message: "Not found." });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[server] ${message}`);
      sendJson(response, 500, { ok: false, message });
    }
  });

  server.listen(config.port, "0.0.0.0", () => {
    console.log(`skeddy-user-relay listening on port ${config.port}`);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
