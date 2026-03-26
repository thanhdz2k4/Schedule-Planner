import { BusinessError } from "@/lib/agent/workflow-engine/errors";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}$/;
const VALID_STATUS = new Set(["todo", "doing", "done"]);
const VALID_PRIORITY = new Set(["high", "medium", "low"]);

function normalizeForStatusMatch(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidDate(date) {
  if (typeof date !== "string" || !DATE_REGEX.test(date)) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function isValidTime(time) {
  if (typeof time !== "string" || !TIME_REGEX.test(time)) {
    return false;
  }

  const [hours, minutes] = time.split(":").map(Number);
  return Number.isInteger(hours) && Number.isInteger(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function toMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function normalizeTitle(rawTitle) {
  if (typeof rawTitle !== "string") {
    return null;
  }
  const title = rawTitle.trim();
  return title || null;
}

function normalizeMinutesBefore(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return undefined;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new BusinessError("minutes_before must be an integer >= 0.", {
      code: "INVALID_REMINDER_OFFSET",
      status: 400,
    });
  }
  return parsed;
}

function normalizeStatus(rawStatus) {
  if (rawStatus === null || rawStatus === undefined || rawStatus === "") {
    return undefined;
  }

  const direct = typeof rawStatus === "string" ? rawStatus.trim().toLowerCase() : "";
  if (VALID_STATUS.has(direct)) {
    return direct;
  }

  const normalized = normalizeForStatusMatch(rawStatus);
  if (
    /\b(done|complete|completed|finish|finished|hoan thanh|xong|xong roi|da xong)\b/.test(
      normalized
    )
  ) {
    return "done";
  }

  if (/\b(doing|in progress|inprogress|dang lam|dang xu ly|active)\b/.test(normalized)) {
    return "doing";
  }

  if (/\b(todo|to do|pending|chua lam|chua xong|not done)\b/.test(normalized)) {
    return "todo";
  }

  if (!VALID_STATUS.has(direct)) {
    throw new BusinessError("status must be one of: todo, doing, done.", {
      code: "INVALID_STATUS",
      status: 400,
    });
  }

  return direct;
}

function normalizePriority(rawPriority) {
  if (rawPriority === null || rawPriority === undefined || rawPriority === "") {
    return undefined;
  }
  if (!VALID_PRIORITY.has(rawPriority)) {
    throw new BusinessError("priority must be one of: high, medium, low.", {
      code: "INVALID_PRIORITY",
      status: 400,
    });
  }
  return rawPriority;
}

function validateTimeWindow(start, end) {
  if (!isValidTime(start) || !isValidTime(end)) {
    throw new BusinessError("start/end time must use HH:mm format.", {
      code: "INVALID_TIME_FORMAT",
      status: 400,
    });
  }

  if (toMinutes(end) <= toMinutes(start)) {
    throw new BusinessError("end must be greater than start.", {
      code: "INVALID_TIME_WINDOW",
      status: 400,
    });
  }
}

export function validateCreateTaskInput(entities) {
  const title = normalizeTitle(entities?.title);
  const date = entities?.date;
  const start = entities?.start;
  const end = entities?.end;

  if (!title || !date || !start || !end) {
    throw new BusinessError("create_task needs title, date, start, end.", {
      code: "MISSING_REQUIRED_FIELDS",
      status: 400,
    });
  }

  if (!isValidDate(date)) {
    throw new BusinessError("date must use YYYY-MM-DD format.", {
      code: "INVALID_DATE_FORMAT",
      status: 400,
    });
  }

  validateTimeWindow(start, end);

  const status = normalizeStatus(entities?.status) || "todo";
  const priority = normalizePriority(entities?.priority) || "medium";
  const minutesBefore = normalizeMinutesBefore(entities?.minutes_before);

  return {
    title,
    date,
    start,
    end,
    status,
    priority,
    minutes_before: minutesBefore,
  };
}

export function validateUpdateTaskPatch(entities, existingTask) {
  const title = normalizeTitle(entities?.title);
  const nextDate = entities?.date || existingTask.date;
  const nextStart = entities?.start || existingTask.start;
  const nextEnd = entities?.end || existingTask.end;
  const nextStatus = normalizeStatus(entities?.status);
  const nextPriority = normalizePriority(entities?.priority);
  const reminderOffset = normalizeMinutesBefore(entities?.minutes_before);

  if (!isValidDate(nextDate)) {
    throw new BusinessError("date must use YYYY-MM-DD format.", {
      code: "INVALID_DATE_FORMAT",
      status: 400,
    });
  }

  validateTimeWindow(nextStart, nextEnd);

  const taskPatch = {};
  if (title && title !== existingTask.title) {
    taskPatch.title = title;
  }
  if (entities?.date && entities.date !== existingTask.date) {
    taskPatch.date = nextDate;
  }
  if (entities?.start && entities.start !== existingTask.start) {
    taskPatch.start = nextStart;
  }
  if (entities?.end && entities.end !== existingTask.end) {
    taskPatch.end = nextEnd;
  }
  if (nextStatus && nextStatus !== existingTask.status) {
    taskPatch.status = nextStatus;
  }
  if (nextPriority && nextPriority !== existingTask.priority) {
    taskPatch.priority = nextPriority;
  }

  const shouldRecheckOverlap = Boolean(taskPatch.date || taskPatch.start || taskPatch.end);
  const hasReminderPatch = reminderOffset !== undefined;
  if (!Object.keys(taskPatch).length && !hasReminderPatch) {
    throw new BusinessError("update_task needs at least one patch field.", {
      code: "EMPTY_PATCH",
      status: 400,
    });
  }

  return {
    taskPatch,
    reminderPatch: hasReminderPatch ? { minutes_before: reminderOffset } : null,
    targetWindow: {
      date: taskPatch.date || existingTask.date,
      start: taskPatch.start || existingTask.start,
      end: taskPatch.end || existingTask.end,
    },
    shouldRecheckOverlap,
  };
}

export function validateDeleteTaskInput(entities) {
  const title = normalizeTitle(entities?.title);
  const taskId = typeof entities?.task_id === "string" ? entities.task_id.trim() : null;

  if (!title && !taskId) {
    throw new BusinessError("delete_task needs title or task_id.", {
      code: "MISSING_TARGET",
      status: 400,
    });
  }

  return {
    title,
    task_id: taskId || null,
    date: typeof entities?.date === "string" ? entities.date : null,
  };
}

export function validateUpdateTaskTargetInput(entities) {
  const title = normalizeTitle(entities?.title);
  const taskId = typeof entities?.task_id === "string" ? entities.task_id.trim() : null;

  if (!title && !taskId) {
    throw new BusinessError("update_task needs title or task_id to resolve target.", {
      code: "MISSING_TARGET",
      status: 400,
    });
  }

  return {
    title,
    task_id: taskId || null,
    date: typeof entities?.date === "string" ? entities.date : null,
  };
}
