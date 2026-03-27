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
    'Use "today_task_list" when user asks list/schedule/tasks for today.',
    'Use "today_unfinished_count" when user asks how many unfinished tasks remain today.',
    'Use "week_total_hours" when user asks total working hours this week.',
    'Use "high_priority_open" when user asks open high priority tasks.',
    'Use "today_summary" for overall summary of today.',
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

function hasTodaySignal(normalizedText) {
  return /\b(hom nay|nay)\b/.test(normalizedText);
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

function resolveQueryTypeByRules({ text }) {
  const normalizedText = normalizeForMatch(text || "");

  if (
    hasTodaySignal(normalizedText) &&
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
    hasTodaySignal(normalizedText) &&
    /\b(liet ke|task nao|danh sach|cong viec nao|viec nao|co gi|lich)\b/.test(normalizedText)
  ) {
    return "today_task_list";
  }

  return "today_summary";
}

async function resolveQueryType({ text, now = new Date() }) {
  const fallbackQueryType = resolveQueryTypeByRules({ text });
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

async function runTodayUnfinishedCount(db, userId, now) {
  const today = toDateString(now);
  const result = await db.query(
    `
      SELECT COUNT(*)::int AS total
      FROM tasks
      WHERE user_id = $1::uuid
        AND date = $2::date
        AND status <> 'done'
    `,
    [userId, today]
  );

  const total = Number(result.rows[0]?.total || 0);
  const summary =
    total === 0
      ? "Hôm nay bạn đã hoàn thành hết task rồi."
      : `Hôm nay bạn còn ${total} task chưa hoàn thành.`;

  return {
    query_type: "today_unfinished_count",
    summary,
    data: { date: today, total },
  };
}

async function runWeekTotalHours(db, userId, now) {
  const monday = startOfWeekMonday(now);
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
    summary: `Tuần này bạn có tổng ${totalHours.toFixed(2)} giờ làm việc (từ ${fromDate} đến ${toDate}).`,
    data: {
      from_date: fromDate,
      to_date: toDate,
      total_hours: totalHours,
    },
  };
}

async function runHighPriorityOpen(db, userId) {
  const result = await db.query(
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
  const summary =
    tasks.length === 0
      ? "Không có task ưu tiên cao nào đang mở."
      : `Có ${tasks.length} task ưu tiên cao chưa hoàn thành:\n${preview.join("\n")}${
          tasks.length > preview.length ? `\n... và ${tasks.length - preview.length} task khác.` : ""
        }`;

  return {
    query_type: "high_priority_open",
    summary,
    data: { tasks },
  };
}

async function runTodayTaskList(db, userId, now) {
  const today = toDateString(now);
  const result = await db.query(
    `
      SELECT id, title, date, start_time, end_time, status, priority
      FROM tasks
      WHERE user_id = $1::uuid
        AND date = $2::date
      ORDER BY start_time ASC, created_at ASC
      LIMIT 50
    `,
    [userId, today]
  );

  const tasks = result.rows.map(mapQueryTaskRow);
  const preview = tasks.slice(0, 10).map(taskToLine);
  const summary =
    tasks.length === 0
      ? "Hôm nay bạn không có task nào."
      : `Hôm nay bạn có ${tasks.length} task:\n${preview.join("\n")}${
          tasks.length > preview.length ? `\n... và ${tasks.length - preview.length} task khác.` : ""
        }`;

  return {
    query_type: "today_task_list",
    summary,
    data: { date: today, tasks },
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

async function runNextOpenTask(db, userId, now) {
  const today = toDateString(now);
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
    [userId, today]
  );

  const openTasks = result.rows.map(mapQueryTaskRow);
  if (openTasks.length === 0) {
    return {
      query_type: "next_open_task",
      summary: "Hôm nay bạn không còn task chưa hoàn thành.",
      data: {
        date: today,
        remaining_open_tasks: 0,
        selected_task: null,
        open_tasks: [],
      },
    };
  }

  const picked = pickNextOpenTask(openTasks, now);
  const selectedTask = picked.task;

  if (!selectedTask) {
    const overdueSummary = summarizeOverdueTasks(picked.overdueTasks);
    const summary = overdueSummary
      ? `Từ bây giờ không còn task nào trong hôm nay. Bạn còn ${picked.overdueTasks.length} task chưa hoàn thành nhưng đã quá giờ: ${overdueSummary}.`
      : "Từ bây giờ không còn task nào trong hôm nay.";

    return {
      query_type: "next_open_task",
      summary,
      data: {
        date: today,
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
      ? "Bạn chỉ còn 1 task chưa hoàn thành."
      : `Bạn còn ${openTasks.length} task chưa hoàn thành.`
  } Việc cần làm tiếp theo: ${selectedTask.start}-${selectedTask.end} | ${selectedTask.title} (${statusLabel(
    selectedTask.status
  )}, ưu tiên ${priorityLabel(selectedTask.priority)}), vì ${picked.reason}.`;

  return {
    query_type: "next_open_task",
    summary,
    data: {
      date: today,
      remaining_open_tasks: openTasks.length,
      selected_task: selectedTask,
      open_tasks: openTasks,
      upcoming_open_tasks: picked.upcomingTasks,
      overdue_open_tasks: picked.overdueTasks,
    },
  };
}

async function runFirstOpenTask(db, userId, now) {
  const today = toDateString(now);
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
    [userId, today]
  );

  const openTasks = result.rows.map(mapQueryTaskRow);
  if (openTasks.length === 0) {
    return {
      query_type: "first_open_task",
      summary: "Hom nay ban khong con task chua hoan thanh.",
      data: {
        date: today,
        remaining_open_tasks: 0,
        selected_task: null,
        open_tasks: [],
      },
    };
  }

  const selectedTask = openTasks[0];
  const summary = `${
    openTasks.length === 1
      ? "Ban chi con 1 task chua hoan thanh."
      : `Ban con ${openTasks.length} task chua hoan thanh.`
  } Viec nen lam truoc: ${selectedTask.start}-${selectedTask.end} | ${selectedTask.title} (${statusLabel(
    selectedTask.status
  )}, uu tien ${priorityLabel(selectedTask.priority)}), vi day la task som nhat chua xong hom nay.`;

  return {
    query_type: "first_open_task",
    summary,
    data: {
      date: today,
      remaining_open_tasks: openTasks.length,
      selected_task: selectedTask,
      open_tasks: openTasks,
    },
  };
}

async function runTodaySummary(db, userId, now) {
  const today = toDateString(now);
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
    [userId, today]
  );

  const row = result.rows[0] || {};
  const summaryData = {
    date: today,
    total: Number(row.total || 0),
    done: Number(row.done || 0),
    open: Number(row.open || 0),
    total_hours: Number(row.total_hours || 0),
  };

  let summary = "Hôm nay bạn chưa có task nào.";
  if (summaryData.total > 0) {
    summary = `Hôm nay bạn có ${summaryData.total} task, đã hoàn thành ${summaryData.done}, còn ${summaryData.open}. Tổng thời gian dự kiến ${summaryData.total_hours.toFixed(2)} giờ.`;
  }

  return {
    query_type: "today_summary",
    summary,
    data: summaryData,
  };
}

async function runQueryByType({ db, userId, now, queryType }) {
  switch (queryType) {
    case "today_unfinished_count":
      return runTodayUnfinishedCount(db, userId, now);
    case "week_total_hours":
      return runWeekTotalHours(db, userId, now);
    case "high_priority_open":
      return runHighPriorityOpen(db, userId);
    case "today_task_list":
      return runTodayTaskList(db, userId, now);
    case "first_open_task":
      return runFirstOpenTask(db, userId, now);
    case "next_open_task":
      return runNextOpenTask(db, userId, now);
    case "today_summary":
    default:
      return runTodaySummary(db, userId, now);
  }
}

export const queryDataWorkflow = [
  {
    name: "resolve_query_type",
    run: async (ctx) => {
      ctx.state.queryType = await resolveQueryType({ text: ctx.text, now: ctx.now });
      return { query_type: ctx.state.queryType };
    },
  },
  {
    name: "run_query",
    run: async (ctx) => {
      ctx.state.queryPayload = await runQueryByType({
        db: ctx.db,
        userId: ctx.userId,
        now: ctx.now,
        queryType: ctx.state.queryType,
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
