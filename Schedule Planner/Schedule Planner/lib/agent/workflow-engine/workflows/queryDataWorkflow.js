import { formatQueryReply } from "@/lib/agent/workflow-engine/steps/formatReply";
import { normalizeForMatch } from "@/lib/agent/router/textUtils";

const QUERY_TYPE_OPTIONS = new Set([
  "today_unfinished_count",
  "week_total_hours",
  "first_open_task",
  "next_open_task",
  "high_priority_open",
  "today_task_list",
  "today_summary",
]);
const QUERY_TYPE_CLASSIFY_CONFIDENCE_THRESHOLD = 0.62;

function normalizeConfidence(value, fallback = 0.55) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  if (value > 1 && value <= 100) {
    return Math.max(0, Math.min(1, value / 100));
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeQueryType(value, fallback = "today_summary") {
  return typeof value === "string" && QUERY_TYPE_OPTIONS.has(value) ? value : fallback;
}

function extractJsonFromContent(content) {
  if (typeof content !== "string") {
    return null;
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const bracketMatch = candidate.match(/\{[\s\S]*\}/);
    if (!bracketMatch) {
      return null;
    }

    try {
      return JSON.parse(bracketMatch[0]);
    } catch {
      return null;
    }
  }
}

function extractMessageText(responsePayload) {
  const message = responsePayload?.choices?.[0]?.message;
  const content = message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.type === "text" && typeof item?.text === "string") return item.text;
        return "";
      })
      .join("\n");
  }

  return "";
}

function resolveMistralTimeoutMs() {
  const value = Number.parseInt(process.env.MISTRAL_TIMEOUT_MS || "", 10);
  if (!Number.isInteger(value) || value < 2000) {
    return 15000;
  }
  return value;
}

function isMistralConfigured() {
  return Boolean(process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY.trim());
}

function buildQueryTypeClassifierSystemPrompt(todayISO, fallbackQueryType) {
  return [
    "You classify user question type for Schedule Planner query workflow.",
    "Today is " + todayISO + ".",
    "Return plain JSON only with schema:",
    '{ "query_type": "today_unfinished_count|week_total_hours|first_open_task|next_open_task|high_priority_open|today_task_list|today_summary", "confidence": 0.0-1.0 }',
    'Use "first_open_task" when user asks what to do first (e.g. "lam gi truoc", "viec dau tien").',
    'Use "next_open_task" when user asks what to do now/next (e.g. "lam gi bay gio", "viec tiep theo").',
    'Use "today_task_list" when user asks list/schedule/tasks for today or a specific date.',
    'Use "today_unfinished_count" when user asks how many unfinished tasks remain on today or a specific date.',
    'Use "week_total_hours" when user asks total working hours this week.',
    'Use "high_priority_open" when user asks open high priority tasks.',
    'Use "today_summary" for overall summary of today or a specific date.',
    "If unsure, return fallback query_type: " + fallbackQueryType + ".",
  ].join("\n");
}

async function resolveQueryTypeWithMistral({ text, now = new Date(), fallbackQueryType }) {
  if (!isMistralConfigured()) {
    return fallbackQueryType;
  }

  const inputText = typeof text === "string" ? text.trim() : "";
  if (!inputText) {
    return fallbackQueryType;
  }

  const apiKey = process.env.MISTRAL_API_KEY?.trim();
  if (!apiKey) {
    return fallbackQueryType;
  }

  const endpoint = (process.env.MISTRAL_API_URL || "https://api.mistral.ai/v1/chat/completions").trim();
  const model = (process.env.MISTRAL_MODEL || "mistral-large-latest").trim();
  const todayISO = now.toISOString().slice(0, 10);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resolveMistralTimeoutMs());

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: buildQueryTypeClassifierSystemPrompt(todayISO, fallbackQueryType) },
          { role: "user", content: inputText },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Mistral query-type API ${response.status}: ${errorText.slice(0, 250)}`);
    }

    const payload = await response.json();
    const content = extractMessageText(payload);
    const parsed = extractJsonFromContent(content);
    const queryType = normalizeQueryType(parsed?.query_type, fallbackQueryType);
    const confidence = normalizeConfidence(parsed?.confidence, 0.55);

    if (confidence < QUERY_TYPE_CLASSIFY_CONFIDENCE_THRESHOLD) {
      return fallbackQueryType;
    }

    return queryType;
  } catch (error) {
    console.warn("Query-type mistral classifier failed, fallback to rule:", error?.message || error);
    return fallbackQueryType;
  } finally {
    clearTimeout(timeout);
  }
}

function toDateString(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return null;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toISODateUTC(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function asValidDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function isValidISODate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function formatDisplayDate(dateString) {
  if (!isValidISODate(dateString)) {
    return dateString || "";
  }

  const [year, month, day] = dateString.split("-");
  return `${day}/${month}/${year}`;
}

function parseDateSignalFromText(text, now = new Date()) {
  const normalizedText = normalizeForMatch(text || "");
  if (!normalizedText) {
    return null;
  }

  if (/\bhom nay\b/.test(normalizedText)) {
    return toDateString(now);
  }

  if (/\b(ngay mai|mai)\b/.test(normalizedText)) {
    return toDateString(addDays(now, 1));
  }

  if (/\b(ngay kia|mot)\b/.test(normalizedText)) {
    return toDateString(addDays(now, 2));
  }

  const isoMatch = normalizedText.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const year = Number.parseInt(isoMatch[1], 10);
    const month = Number.parseInt(isoMatch[2], 10);
    const day = Number.parseInt(isoMatch[3], 10);
    const date = asValidDate(year, month, day);
    if (date) {
      return toISODateUTC(date);
    }
  }

  const slashMatch = normalizedText.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
  if (slashMatch) {
    const day = Number.parseInt(slashMatch[1], 10);
    const month = Number.parseInt(slashMatch[2], 10);
    const year = slashMatch[3] ? Number.parseInt(slashMatch[3], 10) : now.getFullYear();
    const date = asValidDate(year, month, day);
    if (date) {
      return toISODateUTC(date);
    }
  }

  const weekdayMatch = normalizedText.match(/\bthu\s*([2-8])\b/);
  if (weekdayMatch) {
    const weekdayNumber = Number.parseInt(weekdayMatch[1], 10);
    const targetDay = weekdayNumber === 8 ? 0 : weekdayNumber - 1;
    const today = new Date(now);
    const currentDay = today.getDay();
    let diff = targetDay - currentDay;
    if (diff < 0) {
      diff += 7;
    }
    return toDateString(addDays(today, diff));
  }

  return null;
}

function resolveTargetDate({ entities, text, now = new Date() }) {
  if (isValidISODate(entities?.date)) {
    return {
      date: entities.date,
      explicit: true,
    };
  }

  const fromText = parseDateSignalFromText(text, now);
  if (isValidISODate(fromText)) {
    return {
      date: fromText,
      explicit: true,
    };
  }

  return {
    date: toDateString(now),
    explicit: false,
  };
}

function buildDatePrefix({ targetDate, now, explicitDate }) {
  const today = toDateString(now);
  if (!explicitDate && targetDate === today) {
    return "Hom nay";
  }
  return `Ngay ${formatDisplayDate(targetDate)}`;
}

function toTimeString(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 5);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(11, 16);
  return null;
}

function toMinutes(value) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function startOfWeekMonday(now) {
  const date = new Date(now);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(baseDate, days) {
  const date = new Date(baseDate);
  date.setDate(baseDate.getDate() + days);
  return date;
}

function statusLabel(status) {
  if (status === "done") return "hoàn thành";
  if (status === "doing") return "đang làm";
  return "chưa làm";
}

function priorityLabel(priority) {
  if (priority === "high") return "cao";
  if (priority === "low") return "thấp";
  return "trung bình";
}

function taskToLine(task, index) {
  return `${index + 1}. ${task.start}-${task.end} | ${task.title} (${statusLabel(task.status)}, ưu tiên ${priorityLabel(task.priority)})`;
}

function shouldReturnFirstOpenTask(normalizedText) {
  if (!normalizedText) return false;

  if (
    /\b(task|cong viec|viec)\b/.test(normalizedText) &&
    /\b(truoc|dau tien|truoc tien|bat dau)\b/.test(normalizedText)
  ) {
    return true;
  }

  return (
    /\b(can|nen|phai)\b/.test(normalizedText) &&
    /\b(lam|thuc hien|xu ly|bat dau)\b/.test(normalizedText) &&
    /\b(truoc|dau tien)\b/.test(normalizedText)
  );
}

function shouldReturnNextOpenTask(normalizedText) {
  if (!normalizedText) return false;

  if (
    /\b(task|cong viec|viec)\b/.test(normalizedText) &&
    /\b(bay gio|luc nay|hien tai|tiep theo|gan nhat|sap toi)\b/.test(normalizedText)
  ) {
    return true;
  }

  if (
    /\b(task nao|cong viec nao|viec nao)\b/.test(normalizedText) &&
    /\b(can|nen|phai)\b/.test(normalizedText) &&
    /\b(lam|hoan thanh|xu ly|xong|thuc hien)\b/.test(normalizedText)
  ) {
    return true;
  }

  if (
    /\b(can|nen|phai)\b/.test(normalizedText) &&
    /\b(lam|hoan thanh|xu ly|thuc hien)\b/.test(normalizedText) &&
    /\b(ngay|bay gio|luc nay)\b/.test(normalizedText)
  ) {
    return true;
  }

  return /\b(lam gi tiep|nen lam gi|nen uu tien viec nao)\b/.test(normalizedText);
}

function resolveQueryTypeByRules({ text, now = new Date() }) {
  const normalizedText = normalizeForMatch(text || "");
  const hasDateSignal = Boolean(parseDateSignalFromText(text, now));

  if (
    hasDateSignal &&
    /\b(chua|con)\b/.test(normalizedText) &&
    /\b(bao nhieu|task)\b/.test(normalizedText)
  ) {
    return "today_unfinished_count";
  }

  if (/\b(tuan nay)\b/.test(normalizedText) && /\b(tong|bao nhieu)\b/.test(normalizedText) && /\b(gio)\b/.test(normalizedText)) {
    return "week_total_hours";
  }

  if (shouldReturnFirstOpenTask(normalizedText)) {
    return "first_open_task";
  }

  if (shouldReturnNextOpenTask(normalizedText)) {
    return "next_open_task";
  }

  if (/\b(uu tien cao|high priority)\b/.test(normalizedText) && /\b(chua|dang|open)\b/.test(normalizedText)) {
    return "high_priority_open";
  }

  if (
    hasDateSignal &&
    /\b(liet ke|task nao|danh sach|cong viec nao|viec nao|co gi|lich)\b/.test(normalizedText)
  ) {
    return "today_task_list";
  }

  if (hasDateSignal) {
    return "today_summary";
  }

  return "today_summary";
}

async function resolveQueryType({ text, now = new Date() }) {
  const fallbackQueryType = resolveQueryTypeByRules({ text, now });
  return resolveQueryTypeWithMistral({ text, now, fallbackQueryType });
}

function mapQueryTaskRow(row) {
  return {
    id: row.id,
    title: row.title,
    date: toDateString(row.date),
    start: toTimeString(row.start_time),
    end: toTimeString(row.end_time),
    status: row.status,
    priority: row.priority,
  };
}

async function runTodayUnfinishedCount(db, userId, targetDate, now, explicitDate) {
  const result = await db.query(
    `
      SELECT COUNT(*)::int AS total
      FROM tasks
      WHERE user_id = $1::uuid
        AND date = $2::date
        AND status <> 'done'
    `,
    [userId, targetDate]
  );

  const total = Number(result.rows[0]?.total || 0);
  const datePrefix = buildDatePrefix({ targetDate, now, explicitDate });
  const summary = total === 0 ? `${datePrefix} ban da hoan thanh het task roi.` : `${datePrefix} ban con ${total} task chua hoan thanh.`;

  return {
    query_type: "today_unfinished_count",
    summary,
    data: { date: targetDate, total },
  };
}

async function runWeekTotalHours(db, userId, weekAnchorDate) {
  const anchor = isValidISODate(weekAnchorDate) ? new Date(`${weekAnchorDate}T00:00:00Z`) : new Date();
  const monday = startOfWeekMonday(anchor);
  const sunday = addDays(monday, 6);
  const fromDate = toDateString(monday);
  const toDate = toDateString(sunday);

  const result = await db.query(
    `
      SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600), 0)::numeric(10,2) AS total_hours
      FROM tasks
      WHERE user_id = $1::uuid
        AND date BETWEEN $2::date AND $3::date
    `,
    [userId, fromDate, toDate]
  );

  const totalHours = Number(result.rows[0]?.total_hours || 0);
  return {
    query_type: "week_total_hours",
    summary: `Tuan ${formatDisplayDate(fromDate)} - ${formatDisplayDate(toDate)} ban co tong ${totalHours.toFixed(2)} gio lam viec.`,
    data: {
      from_date: fromDate,
      to_date: toDate,
      total_hours: totalHours,
    },
  };
}

async function runHighPriorityOpen(db, userId, targetDate, now, explicitDate) {
  const hasDateFilter = Boolean(explicitDate && isValidISODate(targetDate));
  const result = hasDateFilter
    ? await db.query(
        `
          SELECT id, title, date, start_time, end_time, status, priority
          FROM tasks
          WHERE user_id = $1::uuid
            AND priority = 'high'
            AND status <> 'done'
            AND date = $2::date
          ORDER BY start_time ASC, created_at ASC
          LIMIT 20
        `,
        [userId, targetDate]
      )
    : await db.query(
        `
          SELECT id, title, date, start_time, end_time, status, priority
          FROM tasks
          WHERE user_id = $1::uuid
            AND priority = 'high'
            AND status <> 'done'
          ORDER BY date ASC, start_time ASC
          LIMIT 20
        `,
        [userId]
      );

  const tasks = result.rows.map(mapQueryTaskRow);
  const preview = tasks.slice(0, 5).map(taskToLine);
  const datePrefix = buildDatePrefix({ targetDate, now, explicitDate: hasDateFilter });

  const summary =
    tasks.length === 0
      ? hasDateFilter
        ? `${datePrefix} khong co task uu tien cao nao dang mo.`
        : "Khong co task uu tien cao nao dang mo."
      : hasDateFilter
        ? `${datePrefix} co ${tasks.length} task uu tien cao chua hoan thanh:\n${preview.join("\n")}${
            tasks.length > preview.length ? `\n... va ${tasks.length - preview.length} task khac.` : ""
          }`
        : `Co ${tasks.length} task uu tien cao chua hoan thanh:\n${preview.join("\n")}${
            tasks.length > preview.length ? `\n... va ${tasks.length - preview.length} task khac.` : ""
          }`;

  return {
    query_type: "high_priority_open",
    summary,
    data: { tasks, date: hasDateFilter ? targetDate : null },
  };
}

async function runTodayTaskList(db, userId, targetDate, now, explicitDate) {
  const result = await db.query(
    `
      SELECT id, title, date, start_time, end_time, status, priority
      FROM tasks
      WHERE user_id = $1::uuid
        AND date = $2::date
      ORDER BY start_time ASC, created_at ASC
      LIMIT 50
    `,
    [userId, targetDate]
  );

  const tasks = result.rows.map(mapQueryTaskRow);
  const preview = tasks.slice(0, 10).map(taskToLine);
  const datePrefix = buildDatePrefix({ targetDate, now, explicitDate });
  const summary =
    tasks.length === 0
      ? `${datePrefix} ban khong co task nao.`
      : `${datePrefix} ban co ${tasks.length} task:\n${preview.join("\n")}${
          tasks.length > preview.length ? `\n... va ${tasks.length - preview.length} task khac.` : ""
        }`;

  return {
    query_type: "today_task_list",
    summary,
    data: { date: targetDate, tasks },
  };
}

function pickNextOpenTask(openTasks, now) {
  const nowMinutes = getCurrentMinutesInPlannerTimezone(now);

  const activeTasks = [];
  const upcomingTasks = [];
  const overdueTasks = [];

  for (const task of openTasks) {
    const start = toMinutes(task.start);
    const end = toMinutes(task.end);
    if (start === null || end === null) continue;

    if (start <= nowMinutes && nowMinutes < end) {
      activeTasks.push(task);
      continue;
    }

    if (start >= nowMinutes) {
      upcomingTasks.push(task);
      continue;
    }

    overdueTasks.push(task);
  }

  if (activeTasks.length > 0) {
    return { task: activeTasks[0], reason: "đang tới giờ thực hiện", upcomingTasks, overdueTasks };
  }

  if (upcomingTasks.length > 0) {
    return { task: upcomingTasks[0], reason: "sắp đến giờ gần nhất", upcomingTasks, overdueTasks };
  }

  return { task: null, reason: "", upcomingTasks, overdueTasks };
}

function getCurrentMinutesInPlannerTimezone(now) {
  const timezone = process.env.PLANNER_DEFAULT_TIMEZONE || "Asia/Ho_Chi_Minh";

  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
    const parts = formatter.formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
    const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
    if (Number.isFinite(hour) && Number.isFinite(minute)) {
      return hour * 60 + minute;
    }
  } catch {}

  return now.getHours() * 60 + now.getMinutes();
}

function toTaskBrief(task) {
  return `${task.start}-${task.end} | ${task.title}`;
}

function summarizeOverdueTasks(tasks) {
  if (!tasks.length) return "";
  const preview = tasks.slice(0, 3).map(toTaskBrief).join("; ");
  if (tasks.length > 3) {
    return `${preview}; ... và ${tasks.length - 3} task quá giờ khác`;
  }
  return preview;
}

async function runNextOpenTask(db, userId, targetDate, now, explicitDate) {
  const result = await db.query(
    `
      SELECT id, title, date, start_time, end_time, status, priority
      FROM tasks
      WHERE user_id = $1::uuid
        AND date = $2::date
        AND status <> 'done'
      ORDER BY start_time ASC, created_at ASC
      LIMIT 50
    `,
    [userId, targetDate]
  );

  const openTasks = result.rows.map(mapQueryTaskRow);
  const datePrefix = buildDatePrefix({ targetDate, now, explicitDate });
  const isTargetToday = targetDate === toDateString(now);

  if (openTasks.length === 0) {
    return {
      query_type: "next_open_task",
      summary: `${datePrefix} ban khong con task chua hoan thanh.`,
      data: {
        date: targetDate,
        remaining_open_tasks: 0,
        selected_task: null,
        open_tasks: [],
      },
    };
  }

  if (!isTargetToday) {
    const selectedTask = openTasks[0];
    const summary = `${datePrefix} ban con ${openTasks.length} task chua hoan thanh. Viec nen lam tiep: ${selectedTask.start}-${selectedTask.end} | ${selectedTask.title} (${statusLabel(selectedTask.status)}, uu tien ${priorityLabel(selectedTask.priority)}), vi day la task som nhat trong ngay.`;

    return {
      query_type: "next_open_task",
      summary,
      data: {
        date: targetDate,
        remaining_open_tasks: openTasks.length,
        selected_task: selectedTask,
        open_tasks: openTasks,
        upcoming_open_tasks: openTasks,
        overdue_open_tasks: [],
      },
    };
  }

  const picked = pickNextOpenTask(openTasks, now);
  const selectedTask = picked.task;

  if (!selectedTask) {
    const overdueSummary = summarizeOverdueTasks(picked.overdueTasks);
    const summary = overdueSummary
      ? `Tu bay gio khong con task nao trong ${datePrefix.toLowerCase()}. Ban con ${picked.overdueTasks.length} task chua hoan thanh nhung da qua gio: ${overdueSummary}.`
      : `Tu bay gio khong con task nao trong ${datePrefix.toLowerCase()}.`;

    return {
      query_type: "next_open_task",
      summary,
      data: {
        date: targetDate,
        remaining_open_tasks: openTasks.length,
        selected_task: null,
        open_tasks: openTasks,
        upcoming_open_tasks: [],
        overdue_open_tasks: picked.overdueTasks,
      },
    };
  }

  const summary = `${
    openTasks.length === 1
      ? `${datePrefix} chi con 1 task chua hoan thanh.`
      : `${datePrefix} con ${openTasks.length} task chua hoan thanh.`
  } Viec can lam tiep theo: ${selectedTask.start}-${selectedTask.end} | ${selectedTask.title} (${statusLabel(selectedTask.status)}, uu tien ${priorityLabel(selectedTask.priority)}), vi ${picked.reason}.`;

  return {
    query_type: "next_open_task",
    summary,
    data: {
      date: targetDate,
      remaining_open_tasks: openTasks.length,
      selected_task: selectedTask,
      open_tasks: openTasks,
      upcoming_open_tasks: picked.upcomingTasks,
      overdue_open_tasks: picked.overdueTasks,
    },
  };
}

async function runFirstOpenTask(db, userId, targetDate, now, explicitDate) {
  const result = await db.query(
    `
      SELECT id, title, date, start_time, end_time, status, priority
      FROM tasks
      WHERE user_id = $1::uuid
        AND date = $2::date
        AND status <> 'done'
      ORDER BY start_time ASC, created_at ASC
      LIMIT 50
    `,
    [userId, targetDate]
  );

  const openTasks = result.rows.map(mapQueryTaskRow);
  const datePrefix = buildDatePrefix({ targetDate, now, explicitDate });

  if (openTasks.length === 0) {
    return {
      query_type: "first_open_task",
      summary: `${datePrefix} ban khong con task chua hoan thanh.`,
      data: {
        date: targetDate,
        remaining_open_tasks: 0,
        selected_task: null,
        open_tasks: [],
      },
    };
  }

  const selectedTask = openTasks[0];
  const summary = `${
    openTasks.length === 1
      ? `${datePrefix} chi con 1 task chua hoan thanh.`
      : `${datePrefix} con ${openTasks.length} task chua hoan thanh.`
  } Viec nen lam truoc: ${selectedTask.start}-${selectedTask.end} | ${selectedTask.title} (${statusLabel(selectedTask.status)}, uu tien ${priorityLabel(selectedTask.priority)}), vi day la task som nhat chua xong.`;

  return {
    query_type: "first_open_task",
    summary,
    data: {
      date: targetDate,
      remaining_open_tasks: openTasks.length,
      selected_task: selectedTask,
      open_tasks: openTasks,
    },
  };
}

async function runTodaySummary(db, userId, targetDate, now, explicitDate) {
  const result = await db.query(
    `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'done')::int AS done,
        COUNT(*) FILTER (WHERE status <> 'done')::int AS open,
        COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600), 0)::numeric(10,2) AS total_hours
      FROM tasks
      WHERE user_id = $1::uuid
        AND date = $2::date
    `,
    [userId, targetDate]
  );

  const row = result.rows[0] || {};
  const summaryData = {
    date: targetDate,
    total: Number(row.total || 0),
    done: Number(row.done || 0),
    open: Number(row.open || 0),
    total_hours: Number(row.total_hours || 0),
  };

  const datePrefix = buildDatePrefix({ targetDate, now, explicitDate });
  let summary = `${datePrefix} ban chua co task nao.`;
  if (summaryData.total > 0) {
    summary = `${datePrefix} ban co ${summaryData.total} task, da hoan thanh ${summaryData.done}, con ${summaryData.open}. Tong thoi gian du kien ${summaryData.total_hours.toFixed(2)} gio.`;
  }

  return {
    query_type: "today_summary",
    summary,
    data: summaryData,
  };
}

async function runQueryByType({ db, userId, now, queryType, targetDate, explicitDate }) {
  switch (queryType) {
    case "today_unfinished_count":
      return runTodayUnfinishedCount(db, userId, targetDate, now, explicitDate);
    case "week_total_hours":
      return runWeekTotalHours(db, userId, targetDate);
    case "high_priority_open":
      return runHighPriorityOpen(db, userId, targetDate, now, explicitDate);
    case "today_task_list":
      return runTodayTaskList(db, userId, targetDate, now, explicitDate);
    case "first_open_task":
      return runFirstOpenTask(db, userId, targetDate, now, explicitDate);
    case "next_open_task":
      return runNextOpenTask(db, userId, targetDate, now, explicitDate);
    case "today_summary":
    default:
      return runTodaySummary(db, userId, targetDate, now, explicitDate);
  }
}

export const queryDataWorkflow = [
  {
    name: "resolve_query_type",
    run: async (ctx) => {
      ctx.state.targetDateContext = resolveTargetDate({
        entities: ctx.entities,
        text: ctx.text,
        now: ctx.now,
      });
      ctx.state.queryType = await resolveQueryType({ text: ctx.text, now: ctx.now });
      return {
        query_type: ctx.state.queryType,
        target_date: ctx.state.targetDateContext.date,
        explicit_date: ctx.state.targetDateContext.explicit,
      };
    },
  },
  {
    name: "run_query",
    run: async (ctx) => {
      const targetDate = ctx.state.targetDateContext?.date || toDateString(ctx.now);
      const explicitDate = Boolean(ctx.state.targetDateContext?.explicit);

      ctx.state.queryPayload = await runQueryByType({
        db: ctx.db,
        userId: ctx.userId,
        now: ctx.now,
        queryType: ctx.state.queryType,
        targetDate,
        explicitDate,
      });

      return {
        query_type: ctx.state.queryPayload.query_type,
      };
    },
  },
  {
    name: "format_reply",
    run: async (ctx) => {
      ctx.result = formatQueryReply(ctx.state.queryPayload);
      return { message: ctx.result.message };
    },
  },
];
