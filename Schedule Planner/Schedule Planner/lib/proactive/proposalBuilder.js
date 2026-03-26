function toDateString(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return "";
}

function toTimeString(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.slice(0, 5);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(11, 16);
  }

  return "";
}

function toMinutes(timeText) {
  if (typeof timeText !== "string" || !/^\d{2}:\d{2}$/.test(timeText)) {
    return null;
  }

  const [hours, minutes] = timeText.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function resolvePriorityWeight(priority) {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

function mapTaskRow(row) {
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

function formatShortDate(dateValue) {
  const [year, month, day] = dateValue.split("-").map(Number);
  if (!year || !month || !day) {
    return dateValue;
  }

  return `${day.toString().padStart(2, "0")}/${month.toString().padStart(2, "0")}`;
}

function createDateFromYmd(ymd) {
  const match = typeof ymd === "string" ? ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day));
}

function toYmd(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(ymd, days) {
  const date = createDateFromYmd(ymd);
  if (!date) {
    return ymd;
  }

  date.setUTCDate(date.getUTCDate() + days);
  return toYmd(date);
}

function computeWeekRange(localDate) {
  const date = createDateFromYmd(localDate);
  if (!date) {
    return { from: localDate, to: localDate };
  }

  const dayOfWeekMonday0 = (date.getUTCDay() + 6) % 7;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - dayOfWeekMonday0);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    from: toYmd(monday),
    to: toYmd(sunday),
  };
}

function detectTaskConflicts(tasks) {
  const sorted = [...tasks].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.start.localeCompare(b.start);
  });

  const conflicts = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (current.date !== next.date) {
      continue;
    }

    const currentEnd = toMinutes(current.end);
    const nextStart = toMinutes(next.start);
    if (currentEnd === null || nextStart === null) {
      continue;
    }

    if (nextStart < currentEnd) {
      conflicts.push({
        date: current.date,
        firstTask: current,
        secondTask: next,
      });
    }
  }

  return conflicts;
}

function pickPlanCandidates(tasksToday) {
  return tasksToday
    .filter((task) => task.status !== "done")
    .sort((a, b) => {
      const weightGap = resolvePriorityWeight(b.priority) - resolvePriorityWeight(a.priority);
      if (weightGap !== 0) {
        return weightGap;
      }

      return a.start.localeCompare(b.start);
    });
}

function summarizeTask(task) {
  return `${task.start}-${task.end} | ${task.title} (${task.priority})`;
}

function buildFocusHint(focusWindow) {
  if (focusWindow === "morning") {
    return "Use morning blocks for deep work first.";
  }
  if (focusWindow === "afternoon") {
    return "Use afternoon for heavy tasks and morning for setup.";
  }
  if (focusWindow === "evening") {
    return "Keep daytime for meetings, reserve evening for focus tasks.";
  }

  return "Prioritize high-impact tasks first and batch low-priority work later.";
}

function extractOverdueTasks(tasksUpToToday, localDate, localTime) {
  const nowMinutes = toMinutes(localTime);

  return tasksUpToToday.filter((task) => {
    if (task.status === "done") {
      return false;
    }

    if (task.date < localDate) {
      return true;
    }

    if (task.date > localDate) {
      return false;
    }

    const taskEnd = toMinutes(task.end);
    if (taskEnd === null || nowMinutes === null) {
      return false;
    }

    return taskEnd < nowMinutes;
  });
}

export function resolveUserLocalClock(now, timezone) {
  const safeTimezone =
    typeof timezone === "string" && timezone.trim() ? timezone.trim() : "Asia/Ho_Chi_Minh";

  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: safeTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find((item) => item.type === "year")?.value || "1970";
    const month = parts.find((item) => item.type === "month")?.value || "01";
    const day = parts.find((item) => item.type === "day")?.value || "01";
    const hour = parts.find((item) => item.type === "hour")?.value || "00";
    const minute = parts.find((item) => item.type === "minute")?.value || "00";

    return {
      timezone: safeTimezone,
      date: `${year}-${month}-${day}`,
      time: `${hour}:${minute}`,
    };
  } catch {
    return {
      timezone: safeTimezone,
      date: toDateString(now),
      time: toTimeString(now),
    };
  }
}

export async function loadTasksForDateRange(db, { userId, fromDate, toDate }) {
  const result = await db.query(
    `
      SELECT id, title, date, start_time, end_time, status, priority
      FROM tasks
      WHERE user_id = $1::uuid
        AND date BETWEEN $2::date AND $3::date
      ORDER BY date ASC, start_time ASC, created_at ASC
      LIMIT 500
    `,
    [userId, fromDate, toDate]
  );

  return result.rows.map(mapTaskRow);
}

export async function loadTasksUpToDate(db, { userId, toDate }) {
  const result = await db.query(
    `
      SELECT id, title, date, start_time, end_time, status, priority
      FROM tasks
      WHERE user_id = $1::uuid
        AND date <= $2::date
      ORDER BY date ASC, start_time ASC, created_at ASC
      LIMIT 500
    `,
    [userId, toDate]
  );

  return result.rows.map(mapTaskRow);
}

export async function loadUserProfileForPlanner(db, userId) {
  const result = await db.query(
    `
      SELECT id, email, timezone
      FROM users
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [userId]
  );

  if (!result.rowCount) {
    return {
      userId,
      email: "",
      timezone: "Asia/Ho_Chi_Minh",
    };
  }

  const row = result.rows[0];
  return {
    userId: row.id,
    email: row.email || "",
    timezone: row.timezone || "Asia/Ho_Chi_Minh",
  };
}

export async function loadFocusWindowPreference(db, userId) {
  const result = await db.query(
    `
      SELECT fact_value
      FROM user_memory_facts
      WHERE user_id = $1::uuid
        AND fact_type = 'habit'
        AND fact_key = 'focus_window'
      ORDER BY confidence DESC, last_seen_at DESC
      LIMIT 1
    `,
    [userId]
  );

  if (!result.rowCount) {
    return "";
  }

  const value = typeof result.rows[0].fact_value === "string" ? result.rows[0].fact_value.trim() : "";
  return value;
}

export function buildPlanDayPayload({ tasksToday, localClock, focusWindow }) {
  const openTasks = pickPlanCandidates(tasksToday);
  const doneCount = tasksToday.filter((task) => task.status === "done").length;
  const todayOpenCount = openTasks.length;
  const topItems = openTasks.slice(0, 5);

  const summaryLines = [];
  summaryLines.push(
    `Today (${localClock.date}) has ${tasksToday.length} tasks: ${doneCount} done, ${todayOpenCount} open.`
  );
  summaryLines.push(buildFocusHint(focusWindow));

  if (topItems.length) {
    summaryLines.push("Suggested order:");
    for (const [index, task] of topItems.entries()) {
      summaryLines.push(`${index + 1}. ${summarizeTask(task)}`);
    }
  } else {
    summaryLines.push("No open task left for today.");
  }

  return {
    summary: summaryLines.join("\n"),
    data: {
      date: localClock.date,
      focus_window: focusWindow || null,
      total_tasks: tasksToday.length,
      done_tasks: doneCount,
      open_tasks: todayOpenCount,
      suggested_tasks: topItems,
    },
  };
}

export function buildPlanWeekPayload({ tasksWeek, localDate }) {
  const weekRange = computeWeekRange(localDate);
  const openTasks = tasksWeek.filter((task) => task.status !== "done");
  const highPriorityOpen = openTasks.filter((task) => task.priority === "high");

  const byDate = new Map();
  for (const task of openTasks) {
    if (!byDate.has(task.date)) {
      byDate.set(task.date, []);
    }
    byDate.get(task.date).push(task);
  }

  const dateKeys = Array.from(byDate.keys()).sort();
  const summaryLines = [];
  summaryLines.push(`Week plan ${formatShortDate(weekRange.from)}-${formatShortDate(weekRange.to)}.`);
  summaryLines.push(
    `Open tasks: ${openTasks.length}, high priority open: ${highPriorityOpen.length}.`
  );

  for (const dateKey of dateKeys.slice(0, 7)) {
    const dayTasks = byDate.get(dateKey) || [];
    const top = dayTasks
      .sort((a, b) => resolvePriorityWeight(b.priority) - resolvePriorityWeight(a.priority))
      .slice(0, 2)
      .map((task) => summarizeTask(task));
    if (!top.length) {
      continue;
    }
    summaryLines.push(`${formatShortDate(dateKey)}: ${top.join("; ")}`);
  }

  return {
    summary: summaryLines.join("\n"),
    data: {
      week_from: weekRange.from,
      week_to: weekRange.to,
      open_tasks: openTasks.length,
      high_priority_open: highPriorityOpen.length,
      open_tasks_by_date: Object.fromEntries(
        Array.from(byDate.entries()).map(([dateKey, dayTasks]) => [
          dateKey,
          dayTasks.map((task) => ({
            id: task.id,
            title: task.title,
            start: task.start,
            end: task.end,
            priority: task.priority,
            status: task.status,
          })),
        ])
      ),
    },
  };
}

export function buildDetectRiskPayload({ tasksToday, tasksUpToToday, localClock }) {
  const conflicts = detectTaskConflicts(tasksToday);
  const overdueTasks = extractOverdueTasks(tasksUpToToday, localClock.date, localClock.time);
  const highPriorityOverdue = overdueTasks.filter((task) => task.priority === "high");

  const summaryLines = [];
  if (!conflicts.length && !overdueTasks.length) {
    summaryLines.push("No major schedule risks detected right now.");
  } else {
    summaryLines.push(`Detected ${conflicts.length} conflicts and ${overdueTasks.length} overdue tasks.`);
    if (highPriorityOverdue.length) {
      summaryLines.push(`${highPriorityOverdue.length} overdue tasks are high priority.`);
    }
  }

  return {
    summary: summaryLines.join("\n"),
    data: {
      date: localClock.date,
      time: localClock.time,
      conflict_count: conflicts.length,
      overdue_count: overdueTasks.length,
      high_priority_overdue_count: highPriorityOverdue.length,
      conflicts,
      overdue_tasks: overdueTasks,
    },
  };
}

export function buildRescheduleChainPayload({ tasksUpToToday, localClock, maxItems = 3 }) {
  const overdueTasks = extractOverdueTasks(tasksUpToToday, localClock.date, localClock.time)
    .sort((a, b) => {
      const priorityGap = resolvePriorityWeight(b.priority) - resolvePriorityWeight(a.priority);
      if (priorityGap !== 0) {
        return priorityGap;
      }

      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return a.start.localeCompare(b.start);
    })
    .slice(0, Math.max(1, Math.min(10, maxItems)));

  const suggestions = overdueTasks.map((task, index) => {
    const targetDate = addDays(localClock.date, index === 0 ? 0 : 1);
    return {
      task_id: task.id,
      task_title: task.title,
      current_date: task.date,
      current_start: task.start,
      current_end: task.end,
      suggested_date: targetDate,
      suggested_start: task.start,
      suggested_end: task.end,
    };
  });

  const summary =
    suggestions.length === 0
      ? "No overdue chain detected. Nothing to reschedule."
      : `Prepared ${suggestions.length} reschedule suggestions. Review and approve before applying.`;

  return {
    summary,
    data: {
      date: localClock.date,
      time: localClock.time,
      suggestions,
    },
  };
}

export function buildDailyDigestProposal({ tasksToday, localClock }) {
  const doneCount = tasksToday.filter((task) => task.status === "done").length;
  const openCount = tasksToday.length - doneCount;
  const highPriorityOpen = tasksToday.filter(
    (task) => task.status !== "done" && task.priority === "high"
  );

  const summaryLines = [];
  summaryLines.push(`Daily digest ${localClock.date}: ${tasksToday.length} tasks total.`);
  summaryLines.push(`${doneCount} done, ${openCount} open.`);
  if (highPriorityOpen.length) {
    summaryLines.push(`High priority open: ${highPriorityOpen.length}.`);
  }

  return {
    actionType: "daily_digest",
    riskLevel: "low",
    title: `Daily digest ${localClock.date}`,
    summary: summaryLines.join(" "),
    dedupeKey: `daily_digest:${localClock.date}`,
    payload: {
      date: localClock.date,
      done_count: doneCount,
      open_count: openCount,
      high_priority_open_count: highPriorityOpen.length,
      top_open_tasks: highPriorityOpen.slice(0, 5),
    },
  };
}

export function buildConflictAlertProposal({ tasksToday, localClock }) {
  const conflicts = detectTaskConflicts(tasksToday);
  if (!conflicts.length) {
    return null;
  }

  return {
    actionType: "conflict_alert",
    riskLevel: "medium",
    title: `Conflict alert (${conflicts.length})`,
    summary: `Detected ${conflicts.length} schedule conflicts for ${localClock.date}.`,
    dedupeKey: `conflict_alert:${localClock.date}:${conflicts.length}`,
    payload: {
      date: localClock.date,
      conflict_count: conflicts.length,
      conflicts,
    },
  };
}

export function buildRiskAlertProposal({ tasksUpToToday, localClock }) {
  const overdueTasks = extractOverdueTasks(tasksUpToToday, localClock.date, localClock.time);
  if (!overdueTasks.length) {
    return null;
  }

  const highPriorityOverdue = overdueTasks.filter((task) => task.priority === "high");

  return {
    actionType: "risk_alert",
    riskLevel: highPriorityOverdue.length ? "high" : "medium",
    title: `Risk alert (${overdueTasks.length} overdue)`,
    summary: `${overdueTasks.length} tasks are overdue. ${highPriorityOverdue.length} are high priority.`,
    dedupeKey: `risk_alert:${localClock.date}:${overdueTasks.length}:${highPriorityOverdue.length}`,
    payload: {
      date: localClock.date,
      time: localClock.time,
      overdue_count: overdueTasks.length,
      high_priority_overdue_count: highPriorityOverdue.length,
      overdue_tasks: overdueTasks.slice(0, 20),
    },
  };
}

export function resolveCurrentWeekRange(localDate) {
  return computeWeekRange(localDate);
}
