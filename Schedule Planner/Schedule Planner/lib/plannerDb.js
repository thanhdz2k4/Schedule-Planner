import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import { listGoalsByUser, replaceGoalsForUser } from "@/lib/db/queries/goalQueries";
import { getReminderLeadSecondsForUser } from "@/lib/db/queries/reminderUserSettingQueries";
import { listTasksByUser, rebuildReminderJobsForUser, replaceTasksForUser } from "@/lib/db/queries/taskQueries";
import { DEFAULT_USER_ID, DEFAULT_USER_TIMEZONE, ensureUserExists, resolveUserId } from "@/lib/db/users";
import { syncGoalProgress } from "@/lib/plannerStore";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_STATUSES = new Set(["todo", "doing", "done"]);
const VALID_PRIORITIES = new Set(["high", "medium", "low"]);
const VALID_PRIORITY_SOURCES = new Set(["manual", "rule", "ai"]);

let schemaReady;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizeDate(value, fallback = todayISO()) {
  return isValidDateString(value) ? value : fallback;
}

function toMinutes(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

function toHHMM(minutes) {
  const safeMinutes = Math.max(0, Math.min(23 * 60 + 59, minutes));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function normalizeTime(value, fallback) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return fallback;
  }

  const normalized = value.slice(0, 5);
  const hours = Number(normalized.slice(0, 2));
  const minutes = Number(normalized.slice(3, 5));
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return fallback;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return fallback;
  }

  return normalized;
}

function normalizeTimeWindow(rawStart, rawEnd) {
  let startMinutes = toMinutes(normalizeTime(rawStart, "09:00"));
  if (startMinutes >= 23 * 60 + 59) {
    startMinutes = 23 * 60 + 58;
  }

  const endMinutes = toMinutes(normalizeTime(rawEnd, "10:00"));

  if (endMinutes > startMinutes) {
    return { start: toHHMM(startMinutes), end: toHHMM(endMinutes) };
  }

  const adjustedEnd = Math.min(startMinutes + 60, 23 * 60 + 59);
  return {
    start: toHHMM(startMinutes),
    end: toHHMM(adjustedEnd > startMinutes ? adjustedEnd : startMinutes + 1),
  };
}

function normalizeUuid(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return UUID_REGEX.test(trimmed) ? trimmed : null;
}

function normalizeTitle(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
}

function normalizeGoal(rawGoal) {
  const parsedTarget = Number.parseInt(rawGoal?.target, 10);

  return {
    id: normalizeUuid(rawGoal?.id) || crypto.randomUUID(),
    title: normalizeTitle(rawGoal?.title, "Untitled goal"),
    target: Number.isInteger(parsedTarget) && parsedTarget > 0 ? parsedTarget : 1,
    deadline: normalizeDate(rawGoal?.deadline),
  };
}

function normalizeTask(rawTask, validGoalIds) {
  const window = normalizeTimeWindow(rawTask?.start, rawTask?.end);
  const rawGoalId = normalizeUuid(rawTask?.goalId ?? rawTask?.goal_id ?? null);
  const goalId = rawGoalId && validGoalIds.has(rawGoalId) ? rawGoalId : "";

  return {
    id: normalizeUuid(rawTask?.id) || crypto.randomUUID(),
    title: normalizeTitle(rawTask?.title, "Untitled task"),
    date: normalizeDate(rawTask?.date),
    start: window.start,
    end: window.end,
    status: VALID_STATUSES.has(rawTask?.status) ? rawTask.status : "todo",
    priority: VALID_PRIORITIES.has(rawTask?.priority) ? rawTask.priority : "medium",
    prioritySource: VALID_PRIORITY_SOURCES.has(rawTask?.prioritySource)
      ? rawTask.prioritySource
      : VALID_PRIORITY_SOURCES.has(rawTask?.priority_source)
      ? rawTask.priority_source
      : "manual",
    goalId,
  };
}

function normalizeStateShape(input) {
  const goalsById = new Map();
  const tasksById = new Map();
  const rawGoals = Array.isArray(input?.goals) ? input.goals : [];
  const rawTasks = Array.isArray(input?.tasks) ? input.tasks : [];

  for (const rawGoal of rawGoals) {
    const normalizedGoal = normalizeGoal(rawGoal);
    goalsById.set(normalizedGoal.id, normalizedGoal);
  }

  const validGoalIds = new Set(goalsById.keys());
  for (const rawTask of rawTasks) {
    const normalizedTask = normalizeTask(rawTask, validGoalIds);
    tasksById.set(normalizedTask.id, normalizedTask);
  }

  const normalized = {
    tasks: [...tasksById.values()],
    goals: [...goalsById.values()],
  };

  syncGoalProgress(normalized);
  return normalized;
}

function normalizeRequestedUserId(rawUserId) {
  return resolveUserId(rawUserId);
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = ensureMigrations().catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }

  return schemaReady;
}

async function ensurePlannerUser(db, userId) {
  await ensureUserExists(db, userId, DEFAULT_USER_TIMEZONE);
}

async function hasRelationalData(db, userId) {
  const result = await db.query(
    `
      SELECT
        EXISTS(SELECT 1 FROM tasks WHERE user_id = $1::uuid) AS has_tasks,
        EXISTS(SELECT 1 FROM goals WHERE user_id = $1::uuid) AS has_goals
    `,
    [userId]
  );

  if (!result.rowCount) {
    return false;
  }

  return Boolean(result.rows[0].has_tasks || result.rows[0].has_goals);
}

async function hasLegacyJsonTable(db) {
  const result = await db.query("SELECT to_regclass('public.planner_states') AS table_name");
  return Boolean(result.rows?.[0]?.table_name);
}

async function migrateLegacyPlannerStateIfNeeded(db, userId) {
  if (userId !== DEFAULT_USER_ID) {
    return;
  }

  if (await hasRelationalData(db, userId)) {
    return;
  }

  if (!(await hasLegacyJsonTable(db))) {
    return;
  }

  const legacyResult = await db.query("SELECT data FROM planner_states WHERE id = 1");
  if (!legacyResult.rowCount) {
    return;
  }

  const normalized = normalizeStateShape(legacyResult.rows[0].data);
  if (!normalized.tasks.length && !normalized.goals.length) {
    return;
  }

  await replaceGoalsForUser(db, userId, normalized.goals);
  await replaceTasksForUser(db, userId, normalized.tasks);
}

async function readStateFromRelationalTables(db, userId) {
  const [tasks, goals] = await Promise.all([listTasksByUser(db, userId), listGoalsByUser(db, userId)]);

  const state = { tasks, goals };
  syncGoalProgress(state);
  return state;
}

export async function readPlannerState(rawUserId) {
  const userId = normalizeRequestedUserId(rawUserId);
  await ensureSchema();

  const state = await withTransaction(async (db) => {
    await ensurePlannerUser(db, userId);
    await migrateLegacyPlannerStateIfNeeded(db, userId);
    return readStateFromRelationalTables(db, userId);
  });

  if (!state.tasks.length && !state.goals.length) {
    return null;
  }

  return state;
}

export async function writePlannerState(input, rawUserId) {
  const userId = normalizeRequestedUserId(rawUserId);
  await ensureSchema();
  const normalized = normalizeStateShape(input);

  return withTransaction(async (db) => {
    await ensurePlannerUser(db, userId);
    await replaceGoalsForUser(db, userId, normalized.goals);
    await replaceTasksForUser(db, userId, normalized.tasks);
    const leadSeconds = await getReminderLeadSecondsForUser(db, userId);
    await rebuildReminderJobsForUser(db, userId, normalized.tasks, {
      leadSeconds,
    });
    return readStateFromRelationalTables(db, userId);
  });
}

