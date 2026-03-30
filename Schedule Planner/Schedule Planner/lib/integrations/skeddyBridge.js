import { createHmac } from "node:crypto";

const DEFAULT_TIMEOUT_MS = 6000;
const TASK_FIELDS = ["id", "title", "date", "start", "end", "status", "priority", "prioritySource", "goalId"];

function toNonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function resolveWebhookUrl() {
  return toNonEmptyString(process.env.SKEDDY_BRIDGE_WEBHOOK_URL);
}

function resolveWebhookSecret() {
  return toNonEmptyString(process.env.SKEDDY_BRIDGE_WEBHOOK_SECRET);
}

function resolveTimeoutMs() {
  const raw = Number.parseInt(process.env.SKEDDY_BRIDGE_TIMEOUT_MS || "", 10);
  if (!Number.isInteger(raw) || raw < 1000) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(raw, 30000);
}

function normalizeTask(input) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const task = {
    id: toNonEmptyString(input.id),
    title: typeof input.title === "string" ? input.title.trim() : "",
    date: toNonEmptyString(input.date),
    start: toNonEmptyString(input.start),
    end: toNonEmptyString(input.end),
    status: toNonEmptyString(input.status) || "todo",
    priority: toNonEmptyString(input.priority) || "medium",
    prioritySource: toNonEmptyString(input.prioritySource || input.priority_source) || "manual",
    goalId: toNonEmptyString(input.goalId || input.goal_id),
  };

  if (!task.id || !task.title || !task.date || !task.start || !task.end) {
    return null;
  }

  return task;
}

function createTaskCommand(task) {
  if (!task || typeof task !== "object") {
    return "";
  }

  const title = typeof task.title === "string" ? task.title.trim() : "";
  const date = toNonEmptyString(task.date);
  const start = toNonEmptyString(task.start);
  const id = toNonEmptyString(task.id);
  if (!title || !date || !start || !id) {
    return "";
  }

  const safeTitle = title.replace(/\s+/g, " ").trim();
  return `${safeTitle} at ${date} ${start} #sp_${id}`;
}

function pickTaskSignature(task) {
  return TASK_FIELDS.map((field) => (task[field] ?? "")).join("|");
}

function mapTaskById(tasks) {
  const map = new Map();
  for (const item of Array.isArray(tasks) ? tasks : []) {
    const normalized = normalizeTask(item);
    if (normalized) {
      map.set(normalized.id, normalized);
    }
  }
  return map;
}

function diffTasks(previousTasks, nextTasks) {
  const previousMap = mapTaskById(previousTasks);
  const nextMap = mapTaskById(nextTasks);

  const created = [];
  const updated = [];
  const deleted = [];

  for (const [id, nextTask] of nextMap) {
    const previousTask = previousMap.get(id);
    if (!previousTask) {
      created.push(nextTask);
      continue;
    }

    if (pickTaskSignature(previousTask) !== pickTaskSignature(nextTask)) {
      updated.push({
        before: previousTask,
        after: nextTask,
      });
    }
  }

  for (const [id, previousTask] of previousMap) {
    if (!nextMap.has(id)) {
      deleted.push(previousTask);
    }
  }

  return { created, updated, deleted };
}

function signPayload(payloadText, secret) {
  if (!secret) {
    return "";
  }
  return createHmac("sha256", secret).update(payloadText).digest("hex");
}

async function postBridgeEvent(payload) {
  const webhookUrl = resolveWebhookUrl();
  if (!webhookUrl) {
    return;
  }

  const payloadText = JSON.stringify(payload);
  const secret = resolveWebhookSecret();
  const signature = signPayload(payloadText, secret);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resolveTimeoutMs());

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Schedule-Source": "schedule-planner",
        "X-Schedule-Event": payload.event_type || "unknown",
        ...(signature ? { "X-Skeddy-Signature": signature } : {}),
      },
      body: payloadText,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(
        `[skeddy-bridge] webhook failed (${response.status}): ${errorText || response.statusText || "unknown"}`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[skeddy-bridge] webhook request error: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}

export function emitSkeddyPlannerStateEvent({
  userId,
  trigger = "planner_state_put",
  previousState,
  nextState,
}) {
  if (!resolveWebhookUrl()) {
    return;
  }

  const previousTasks = Array.isArray(previousState?.tasks) ? previousState.tasks : [];
  const nextTasks = Array.isArray(nextState?.tasks) ? nextState.tasks : [];
  const diff = diffTasks(previousTasks, nextTasks);
  if (!diff.created.length && !diff.updated.length && !diff.deleted.length) {
    return;
  }

  const activeTasks = nextTasks
    .map(normalizeTask)
    .filter(Boolean)
    .filter((task) => task.status !== "done")
    .map((task) => ({
      ...task,
      skeddy_command: createTaskCommand(task),
    }));

  const payload = {
    event_type: "planner_tasks_changed",
    source: "schedule-planner",
    trigger,
    user_id: userId,
    occurred_at: new Date().toISOString(),
    summary: {
      created: diff.created.length,
      updated: diff.updated.length,
      deleted: diff.deleted.length,
      active_total: activeTasks.length,
    },
    tasks: {
      created: diff.created.map((task) => ({
        ...task,
        skeddy_command: createTaskCommand(task),
      })),
      updated: diff.updated.map((item) => ({
        before: item.before,
        after: item.after,
        skeddy_command: createTaskCommand(item.after),
      })),
      deleted: diff.deleted,
      active: activeTasks,
    },
  };

  void postBridgeEvent(payload);
}

export function emitSkeddyTaskMutationEvent({
  userId,
  action,
  source = "agent_workflow",
  beforeTask = null,
  afterTask = null,
  intent = "",
  inputText = "",
}) {
  if (!resolveWebhookUrl()) {
    return;
  }

  const normalizedBefore = normalizeTask(beforeTask);
  const normalizedAfter = normalizeTask(afterTask);
  const normalizedAction = toNonEmptyString(action) || "unknown";

  const payload = {
    event_type: "planner_task_mutation",
    source: "schedule-planner",
    trigger: source,
    user_id: userId,
    occurred_at: new Date().toISOString(),
    action: normalizedAction,
    intent: toNonEmptyString(intent),
    input_text: typeof inputText === "string" ? inputText : "",
    task: {
      before: normalizedBefore,
      after: normalizedAfter,
      skeddy_command:
        normalizedAction === "delete"
          ? ""
          : createTaskCommand(normalizedAfter || normalizedBefore),
    },
  };

  void postBridgeEvent(payload);
}
