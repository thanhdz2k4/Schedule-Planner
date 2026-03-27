export const STORAGE_KEY = "schedule_planner_state_next_v1";
export const THEME_KEY = "schedule_planner_theme_next_v1";

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function endOfWeekISO() {
  const now = new Date();
  const day = now.getDay() || 7;
  const sunday = new Date(now);
  sunday.setDate(now.getDate() + (7 - day));
  return sunday.toISOString().slice(0, 10);
}

export function defaultState() {
  const today = todayISO();
  const goalA = crypto.randomUUID();
  const goalB = crypto.randomUUID();

  return {
    tasks: [
      {
        id: crypto.randomUUID(),
        date: today,
        title: "Học Spark Streaming",
        start: "08:00",
        end: "10:00",
        status: "doing",
        priority: "high",
        goalId: goalA,
      },
      {
        id: crypto.randomUUID(),
        date: today,
        title: "Code feature login",
        start: "14:00",
        end: "16:00",
        status: "todo",
        priority: "medium",
        goalId: goalB,
      },
      {
        id: crypto.randomUUID(),
        date: today,
        title: "Đọc tài liệu system design",
        start: "20:00",
        end: "21:30",
        status: "todo",
        priority: "low",
        goalId: "",
      },
    ],
    goals: [
      {
        id: goalA,
        title: "Hoàn thành 5 bài Spark",
        target: 5,
        completed: 0,
        deadline: endOfWeekISO(),
      },
      {
        id: goalB,
        title: "Hoàn thiện feature login",
        target: 3,
        completed: 0,
        deadline: endOfWeekISO(),
      },
    ],
  };
}

export function toMinutes(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

export function toHHMM(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function taskDurationMinutes(task) {
  return Math.max(0, toMinutes(task.end) - toMinutes(task.start));
}

export function hasOverlap(tasks, payload, ignoreId = null) {
  const start = toMinutes(payload.start);
  const end = toMinutes(payload.end);

  return tasks.some((task) => {
    if (task.id === ignoreId || task.date !== payload.date) {
      return false;
    }

    const taskStart = toMinutes(task.start);
    const taskEnd = toMinutes(task.end);
    return start < taskEnd && end > taskStart;
  });
}

export function syncGoalProgress(state) {
  const counts = {};

  state.tasks.forEach((task) => {
    if (task.status === "done" && task.goalId) {
      counts[task.goalId] = (counts[task.goalId] || 0) + 1;
    }
  });

  state.goals.forEach((goal) => {
    goal.completed = counts[goal.id] || 0;
  });
}

export function loadState() {
  if (typeof window === "undefined") {
    return { tasks: [], goals: [] };
  }

  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    const created = defaultState();
    syncGoalProgress(created);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(created));
    return created;
  }

  try {
    const parsed = JSON.parse(raw);
    const state = {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
    };
    syncGoalProgress(state);
    return state;
  } catch {
    const fallback = defaultState();
    syncGoalProgress(fallback);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
    return fallback;
  }
}

export function saveState(state) {
  if (typeof window === "undefined") {
    return;
  }

  syncGoalProgress(state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function localeTag(locale = "vi") {
  return locale === "en" ? "en-US" : "vi-VN";
}

export function statusLabel(value, locale = "vi") {
  const labels = {
    vi: { todo: "Chưa làm", doing: "Đang làm", done: "Hoàn thành" },
    en: { todo: "To do", doing: "In progress", done: "Done" },
  };

  return labels[locale]?.[value] || labels.vi[value] || value;
}

export function priorityLabel(value, locale = "vi") {
  const labels = {
    vi: { high: "Cao", medium: "Trung bình", low: "Thấp" },
    en: { high: "High", medium: "Medium", low: "Low" },
  };

  return labels[locale]?.[value] || labels.vi[value] || value;
}

export function daysRemaining(dateStr) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const deadline = new Date(dateStr);
  deadline.setHours(0, 0, 0, 0);
  return Math.ceil((deadline.getTime() - now.getTime()) / 86400000);
}

export function formatDate(dateStr, locale = "vi") {
  return new Date(dateStr).toLocaleDateString(localeTag(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function getStats(tasks) {
  const total = tasks.length;
  const done = tasks.filter((task) => task.status === "done").length;
  const totalMinutes = tasks.reduce((sum, task) => sum + taskDurationMinutes(task), 0);

  return {
    total,
    done,
    rate: total ? Math.round((done / total) * 100) : 0,
    totalMinutes,
    totalHours: (totalMinutes / 60).toFixed(1),
  };
}

