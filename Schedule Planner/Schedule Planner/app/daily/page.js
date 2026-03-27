"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import AppShell from "@/components/AppShell";
import { usePlannerData } from "@/hooks/usePlannerData";
import { useUiLocale } from "@/hooks/useUiLocale";
import { toMinutes, todayISO } from "@/lib/plannerStore";
import cancelIcon from "@/images/icons8-cancel-240.png";

const HOUR_HEIGHT = 36;
const TIMELINE_GUTTER = 74;
const TIMELINE_RIGHT_PADDING = 22;
const WEEKDAY_SHORT_BY_LOCALE = {
  vi: ["CN", "T2", "T3", "T4", "T5", "T6", "T7"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

const CHEER_MESSAGES_BY_LOCALE = {
  vi: ["Tuyệt vời!", "Xuất sắc!", "Hoàn thành!", "Rất tốt!", "Tuyệt cú mèo!"],
  en: ["Awesome!", "Great!", "Done!", "Nice work!", "Excellent!"],
};

const VIEW_OPTIONS = [
  { value: "day", label: { vi: "Ngày", en: "Day" } },
  { value: "week", label: { vi: "Tuần", en: "Week" } },
];

const VIEW_META = {
  day: {
    title: { vi: "Timeline Ngày", en: "Day Timeline" },
    subtitle: {
      vi: "Sắp lịch theo giờ, không cho phép trùng task",
      en: "Plan tasks by hour with no overlaps",
    },
    panelTitle: { vi: "Lịch Làm Việc Theo Ngày", en: "Daily Work Timeline" },
  },
  week: {
    title: { vi: "Timeline Tuần", en: "Week Timeline" },
    subtitle: {
      vi: "Theo dõi toàn bộ task trong tuần trên cùng một timeline",
      en: "Track all tasks in the week on a single timeline",
    },
    panelTitle: { vi: "Lịch Làm Việc Theo Tuần", en: "Weekly Work Timeline" },
  },
  month: {
    title: { vi: "Lịch Làm Việc Tháng", en: "Month Schedule" },
    subtitle: {
      vi: "Hiển thị dạng bảng tháng đầy đủ để xem task rõ ràng",
      en: "Full monthly board view for clearer task tracking",
    },
    panelTitle: { vi: "Lịch Làm Việc Theo Tháng", en: "Monthly Work Timeline" },
  },
};

const STATUS_LABELS = {
  vi: { todo: "Chưa làm", doing: "Đang làm", done: "Hoàn thành" },
  en: { todo: "To do", doing: "In progress", done: "Done" },
};

const PRIORITY_LABELS = {
  vi: { high: "Cao", medium: "Trung bình", low: "Thấp" },
  en: { high: "High", medium: "Medium", low: "Low" },
};

const COPY = {
  vi: {
    quote: "Lên kế hoạch trước khi ngày mới bắt đầu.",
    themeLight: "Chế độ sáng",
    themeDark: "Chế độ tối",
    languageSwitch: "Ngôn ngữ",
    languageAria: "Chuyển ngôn ngữ Việt hoặc Anh",
    timelineModeAria: "Chế độ timeline",
    doneShort: "Xong",
    monthToday: "Hôm nay",
    monthPrev: "Tháng trước",
    monthNext: "Tháng sau",
    taskPlaceholder: "Tên task",
    noGoal: "Không gắn mục tiêu",
    addTask: "Thêm task",
    updateTask: "Cập nhật task",
    viewing: "Đang xem",
    quickEditHint: "Double-click vào task để mở sửa nhanh.",
    goalPrefix: "Mục tiêu",
    completedLabel: "Hoàn thành",
    edit: "Sửa",
    delete: "Xóa",
    cancelEdit: "Hủy sửa task",
    doneCheckTitle: "Đánh dấu hoàn thành",
    priorityWord: "ưu tiên",
    emptyTitleAlert: "Vui lòng nhập tên task.",
    endTimeAlert: "Giờ kết thúc phải lớn hơn giờ bắt đầu.",
    overlapAlert: "Task bị trùng giờ trong cùng ngày.",
    dragOverlapAlert: "Không thể kéo vì bị trùng giờ.",
    noTaskInScope: "Chưa có task",
    remainingPrefix: "Còn",
    inMonth: "trong tháng này",
    inWeek: "trong tuần này",
    inDay: "trong ngày này",
    taskWord: "task",
  },
  en: {
    quote: "Plan the day before it starts.",
    themeLight: "Light mode",
    themeDark: "Dark mode",
    languageSwitch: "Language",
    languageAria: "Switch language between Vietnamese and English",
    timelineModeAria: "Timeline mode",
    doneShort: "Done",
    monthToday: "Today",
    monthPrev: "Previous month",
    monthNext: "Next month",
    taskPlaceholder: "Task title",
    noGoal: "No goal",
    addTask: "Add task",
    updateTask: "Update task",
    viewing: "Viewing",
    quickEditHint: "Double-click a task to quick edit.",
    goalPrefix: "Goal",
    completedLabel: "Complete",
    edit: "Edit",
    delete: "Delete",
    cancelEdit: "Cancel editing task",
    doneCheckTitle: "Mark as done",
    priorityWord: "priority",
    emptyTitleAlert: "Please enter a task name.",
    endTimeAlert: "End time must be later than start time.",
    overlapAlert: "Task overlaps another task on the same day.",
    dragOverlapAlert: "Cannot drag because it overlaps another task.",
    noTaskInScope: "No tasks",
    remainingPrefix: "Remaining",
    inMonth: "this month",
    inWeek: "this week",
    inDay: "this day",
    taskWord: "task",
  },
};

function pad2(value) {
  return String(value).padStart(2, "0");
}

function parseISODate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toISODate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addDays(baseDate, delta) {
  const next = new Date(baseDate);
  next.setDate(baseDate.getDate() + delta);
  return next;
}

function startOfWeekMonday(date) {
  const next = new Date(date);
  const offset = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - offset);
  return next;
}

function dateLocale(locale) {
  return locale === "en" ? "en-US" : "vi-VN";
}

function formatDisplayDate(isoDate, locale) {
  const parsed = parseISODate(isoDate);
  if (!parsed) return isoDate;
  return parsed.toLocaleDateString(dateLocale(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getStatusLabel(locale, status) {
  return STATUS_LABELS[locale]?.[status] || status;
}

function getPriorityLabel(locale, priority) {
  return PRIORITY_LABELS[locale]?.[priority] || priority;
}

function getTaskWord(locale, count) {
  if (locale === "en") {
    return count === 1 ? "task" : "tasks";
  }
  return "task";
}

function formatTaskCount(locale, count) {
  if (!count) return "";
  return `${count} ${getTaskWord(locale, count)}`;
}

function localizeActionMessage(message, locale, copy) {
  if (locale !== "en" || typeof message !== "string") {
    return message;
  }

  if (message === COPY.vi.overlapAlert) {
    return copy.overlapAlert;
  }

  if (message === COPY.vi.dragOverlapAlert) {
    return copy.dragOverlapAlert;
  }

  return message;
}

function getDayWeekRangeDates(mode, anchorISODate, locale) {
  const anchor = parseISODate(anchorISODate) || parseISODate(todayISO()) || new Date();
  const weekdays = WEEKDAY_SHORT_BY_LOCALE[locale] || WEEKDAY_SHORT_BY_LOCALE.vi;

  if (mode === "week") {
    const monday = startOfWeekMonday(anchor);
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(monday, index);
      return {
        date: toISODate(date),
        label: weekdays[date.getDay()],
        subLabel: `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`,
      };
    });
  }

  return [
    {
      date: toISODate(anchor),
      label: formatDisplayDate(toISODate(anchor), locale),
      subLabel: weekdays[anchor.getDay()],
    },
  ];
}

function buildMonthBoard(anchorISODate, locale) {
  const anchor = parseISODate(anchorISODate) || parseISODate(todayISO()) || new Date();
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));

  const cells = [];
  for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 1)) {
    const day = new Date(cursor);
    cells.push({
      date: toISODate(day),
      dayNumber: day.getDate(),
      weekday: (WEEKDAY_SHORT_BY_LOCALE[locale] || WEEKDAY_SHORT_BY_LOCALE.vi)[day.getDay()],
      inCurrentMonth: day.getMonth() === monthStart.getMonth(),
    });
  }

  const monthLabel = monthStart.toLocaleDateString(dateLocale(locale), {
    month: "long",
    year: "numeric",
  });

  return { monthLabel, cells };
}

function getRangeLabel(mode, dates, monthBoard, locale) {
  if (mode === "month") return monthBoard.monthLabel;
  if (!dates.length) return "";
  if (mode === "day") return formatDisplayDate(dates[0].date, locale);
  return `${formatDisplayDate(dates[0].date, locale)} - ${formatDisplayDate(dates[dates.length - 1].date, locale)}`;
}

export default function DailyPage() {
  const { loaded, darkMode, state, actions } = usePlannerData();
  const [locale] = useUiLocale();
  const [timelineMode, setTimelineMode] = useState("day");
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [alert, setAlert] = useState("");
  const [editingId, setEditingId] = useState("");
  const [drag, setDrag] = useState(null);
  const [justCompletedTaskId, setJustCompletedTaskId] = useState("");
  const [justCompletedCheer, setJustCompletedCheer] = useState("");
  const completionEffectTimeoutRef = useRef(null);
  const alertTimeoutRef = useRef(null);
  const [form, setForm] = useState({
    date: todayISO(),
    title: "",
    start: "08:00",
    end: "09:00",
    status: "todo",
    priority: "medium",
    goalId: "",
  });
  const copy = COPY[locale] || COPY.vi;
  const cheerMessages = CHEER_MESSAGES_BY_LOCALE[locale] || CHEER_MESSAGES_BY_LOCALE.vi;

  const goalTitleById = useMemo(
    () => new Map(state.goals.map((goal) => [goal.id, goal.title])),
    [state.goals]
  );
  const monthBoard = useMemo(() => buildMonthBoard(form.date, locale), [form.date, locale]);
  const monthTasksByDate = useMemo(() => {
    const map = new Map();
    for (const cell of monthBoard.cells) {
      map.set(cell.date, []);
    }

    for (const task of state.tasks) {
      const bucket = map.get(task.date);
      if (bucket) {
        bucket.push(task);
      }
    }

    for (const tasks of map.values()) {
      tasks.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    }

    return map;
  }, [state.tasks, monthBoard.cells]);

  const rangeDates = useMemo(() => {
    if (timelineMode === "month") return [];
    return getDayWeekRangeDates(timelineMode, form.date, locale);
  }, [timelineMode, form.date, locale]);
  const rangeDateSet = useMemo(() => new Set(rangeDates.map((item) => item.date)), [rangeDates]);
  const columnIndexByDate = useMemo(
    () => new Map(rangeDates.map((item, index) => [item.date, index])),
    [rangeDates]
  );
  const visibleTasks = useMemo(
    () =>
      state.tasks
        .filter((task) => rangeDateSet.has(task.date))
        .sort((a, b) => a.date.localeCompare(b.date) || toMinutes(a.start) - toMinutes(b.start)),
    [state.tasks, rangeDateSet]
  );

  const isRangeMode = timelineMode === "week";
  const dayColumnWidth = isMobileViewport ? 108 : 120;
  const rangeColumnWidthCss =
    rangeDates.length > 0
      ? `calc((100% - ${TIMELINE_GUTTER + TIMELINE_RIGHT_PADDING}px) / ${rangeDates.length})`
      : `${dayColumnWidth}px`;
  const rangeLabel = getRangeLabel(timelineMode, rangeDates, monthBoard, locale);
  const viewMeta = VIEW_META[timelineMode] || VIEW_META.day;
  const scopeLabel =
    timelineMode === "month" ? copy.inMonth : timelineMode === "week" ? copy.inWeek : copy.inDay;
  const monthCurrentDateSet = useMemo(
    () => new Set(monthBoard.cells.filter((cell) => cell.inCurrentMonth).map((cell) => cell.date)),
    [monthBoard.cells]
  );
  const timelineProgress = useMemo(() => {
    const scopedTasks = state.tasks.filter((task) =>
      timelineMode === "month" ? monthCurrentDateSet.has(task.date) : rangeDateSet.has(task.date)
    );
    const total = scopedTasks.length;
    const done = scopedTasks.filter((task) => task.status === "done").length;
    const remaining = Math.max(0, total - done);
    const percent = total ? Math.round((done / total) * 100) : 0;
    return { total, done, remaining, percent };
  }, [state.tasks, timelineMode, monthCurrentDateSet, rangeDateSet]);

  useEffect(
    () => () => {
      if (completionEffectTimeoutRef.current) {
        clearTimeout(completionEffectTimeoutRef.current);
      }
      if (alertTimeoutRef.current) {
        clearTimeout(alertTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!alert) {
      if (alertTimeoutRef.current) {
        clearTimeout(alertTimeoutRef.current);
        alertTimeoutRef.current = null;
      }
      return;
    }

    if (alertTimeoutRef.current) {
      clearTimeout(alertTimeoutRef.current);
    }

    alertTimeoutRef.current = setTimeout(() => {
      setAlert("");
      alertTimeoutRef.current = null;
    }, 3000);
  }, [alert]);

  useEffect(() => {
    if (drag) {
      document.body.classList.add("dragging-task");
    } else {
      document.body.classList.remove("dragging-task");
    }

    return () => {
      document.body.classList.remove("dragging-task");
    };
  }, [drag]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mobileQuery = window.matchMedia("(max-width: 760px)");
    const syncViewport = () => setIsMobileViewport(mobileQuery.matches);
    syncViewport();
    if (typeof mobileQuery.addEventListener === "function") {
      mobileQuery.addEventListener("change", syncViewport);
      return () => mobileQuery.removeEventListener("change", syncViewport);
    }
    mobileQuery.addListener(syncViewport);
    return () => mobileQuery.removeListener(syncViewport);
  }, []);

  useEffect(() => {
    if (timelineMode === "month") {
      setTimelineMode("week");
    }
  }, [timelineMode]);

  if (!loaded) return null;

  function handleDateChange(nextDate) {
    setForm((prev) => ({ ...prev, date: nextDate }));
  }

  function shiftMonth(delta) {
    const current = parseISODate(form.date) || new Date();
    const target = new Date(current.getFullYear(), current.getMonth() + delta, 1);
    const maxDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(current.getDate(), maxDay));
    handleDateChange(toISODate(target));
  }

  function submitTask(event) {
    event.preventDefault();
    if (!form.title.trim()) {
      setAlert(copy.emptyTitleAlert);
      return;
    }

    if (toMinutes(form.end) <= toMinutes(form.start)) {
      setAlert(copy.endTimeAlert);
      return;
    }

    const payload = { ...form, title: form.title.trim() };
    const result = editingId ? actions.updateTask(editingId, payload) : actions.addTask(payload);

    if (!result.ok) {
      setAlert(localizeActionMessage(result.message, locale, copy));
      return;
    }

    setAlert("");
    setEditingId("");
    setForm({
      ...payload,
      title: "",
      start: "08:00",
      end: "09:00",
      status: "todo",
      priority: "medium",
      goalId: "",
    });
  }

  function onEdit(task) {
    setEditingId(task.id);
    setForm({
      date: task.date,
      title: task.title,
      start: task.start,
      end: task.end,
      status: task.status,
      priority: task.priority,
      goalId: task.goalId || "",
    });
  }

  function resetEdit() {
    setEditingId("");
    setAlert("");
    setForm({ ...form, title: "", start: "08:00", end: "09:00", status: "todo", priority: "medium", goalId: "" });
  }

  function onToggleTaskDone(taskId, checked) {
    actions.toggleTaskDone(taskId, checked);

    if (!checked) {
      if (justCompletedTaskId === taskId) {
        setJustCompletedTaskId("");
        setJustCompletedCheer("");
      }
      return;
    }

    const randomCheer = cheerMessages[Math.floor(Math.random() * cheerMessages.length)];
    setJustCompletedCheer(randomCheer);
    setJustCompletedTaskId(taskId);
    if (completionEffectTimeoutRef.current) {
      clearTimeout(completionEffectTimeoutRef.current);
    }
    completionEffectTimeoutRef.current = setTimeout(() => {
      setJustCompletedTaskId("");
      setJustCompletedCheer("");
      completionEffectTimeoutRef.current = null;
    }, 1400);
  }

  function onDragStart(event, task) {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button, input, label")) {
      return;
    }
    event.preventDefault();
    setDrag({ taskId: task.id, startY: event.clientY });
  }

  function onDragMove(event) {
    if (!drag) return;
    event.preventDefault();
    const deltaY = event.clientY - drag.startY;
    const deltaMinutes = Math.round((deltaY / HOUR_HEIGHT) * 2) * 30;
    if (deltaMinutes === 0) return;

    const result = actions.moveTask(drag.taskId, deltaMinutes);
    if (!result.ok && result.message) {
      setAlert(localizeActionMessage(result.message, locale, copy));
    } else {
      setAlert("");
      setDrag({ ...drag, startY: event.clientY });
    }
  }

  function endDrag() {
    if (drag) {
      setDrag(null);
    }
  }

  function getTaskStyle(task, top, height) {
    if (!isRangeMode) {
      return { top, height };
    }

    const columnIndex = columnIndexByDate.get(task.date);
    if (columnIndex === undefined) {
      return { top, height };
    }

    const left = `calc(${TIMELINE_GUTTER}px + ${columnIndex} * ${rangeColumnWidthCss} + 6px)`;
    const width = `calc(${rangeColumnWidthCss} - 12px)`;
    return { top, height, left, width };
  }

  return (
    <AppShell
      title={viewMeta.title[locale]}
      subtitle={viewMeta.subtitle[locale]}
      goalProgress={state.goalOverall}
      quote={copy.quote}
      themeLabel={darkMode ? copy.themeLight : copy.themeDark}
      onToggleTheme={actions.toggleTheme}
      hideHero
      mainClassName="main-compact main-daily"
    >
      <section className="panel daily-timeline-panel is-timeline-mode">
        <div className="panel-head daily-panel-head">
          <div className="daily-head-main">
            <h3>{viewMeta.panelTitle[locale]}</h3>
            <div className="timeline-progress-card timeline-progress-card-head" aria-live="polite">
              <div
                className="timeline-progress-donut"
                style={{ "--timeline-donut-progress": `${timelineProgress.percent * 3.6}deg` }}
              >
                <div className="timeline-progress-donut-inner">
                  <strong>{timelineProgress.percent}%</strong>
                  <span>{copy.doneShort}</span>
                </div>
              </div>
              <div className="timeline-progress-meta">
                <strong>
                  {timelineProgress.done}/{timelineProgress.total} {getTaskWord(locale, timelineProgress.total)}
                </strong>
                <span>
                  {timelineProgress.total === 0
                    ? `${copy.noTaskInScope} ${scopeLabel}.`
                    : locale === "en"
                      ? `${copy.remainingPrefix} ${timelineProgress.remaining} ${getTaskWord(locale, timelineProgress.remaining)} ${scopeLabel}.`
                      : `${copy.remainingPrefix} ${timelineProgress.remaining} ${copy.taskWord} ${scopeLabel}.`}
                </span>
              </div>
            </div>
          </div>
          <div className="timeline-head-controls">
            <div className="timeline-view-toggle" role="tablist" aria-label={copy.timelineModeAria}>
              {VIEW_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`timeline-view-btn${timelineMode === option.value ? " active" : ""}`}
                  onClick={() => setTimelineMode(option.value)}
                >
                  {option.label[locale]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <form className="grid-form" onSubmit={submitTask}>
          <input type="date" value={form.date} onChange={(event) => handleDateChange(event.target.value)} required />
          <input
            type="text"
            placeholder={copy.taskPlaceholder}
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            required
          />
          <input type="time" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} required />
          <input type="time" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} required />
          <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            <option value="todo">{getStatusLabel(locale, "todo")}</option>
            <option value="doing">{getStatusLabel(locale, "doing")}</option>
            <option value="done">{getStatusLabel(locale, "done")}</option>
          </select>
          <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
            <option value="high">{getPriorityLabel(locale, "high")}</option>
            <option value="medium">{getPriorityLabel(locale, "medium")}</option>
            <option value="low">{getPriorityLabel(locale, "low")}</option>
          </select>
          <select value={form.goalId} onChange={(event) => setForm({ ...form, goalId: event.target.value })}>
            <option value="">{copy.noGoal}</option>
            {state.goals.map((goal) => (
              <option value={goal.id} key={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
          <button className="btn" type="submit">
            {editingId ? copy.updateTask : copy.addTask}
          </button>
        </form>

        {alert ? (
          <p className="toast-alert toast-alert-error" role="status" aria-live="polite">
            {alert}
          </p>
        ) : null}
        <div className="timeline-summary">
          <p className="muted" style={{ marginTop: 8 }}>
            {copy.viewing}: {rangeLabel}. {copy.quickEditHint}
          </p>
        </div>

        <div className="daily-grid-shell">
          {timelineMode === "month" ? (
            <div className="month-table-wrap">
              <div className="month-table-header">
                {(WEEKDAY_SHORT_BY_LOCALE[locale] || WEEKDAY_SHORT_BY_LOCALE.vi).map((weekday) => (
                  <div key={weekday} className="month-weekday">
                    {weekday}
                  </div>
                ))}
              </div>
              <div className="month-table-grid">
                {monthBoard.cells.map((cell) => {
                  const tasks = monthTasksByDate.get(cell.date) || [];
                  const isToday = cell.date === state.today;

                  return (
                    <article
                      key={cell.date}
                      className={`month-cell${cell.inCurrentMonth ? "" : " outside"}${isToday ? " today" : ""}`}
                    >
                      <div className="month-cell-top">
                        <strong>{pad2(cell.dayNumber)}</strong>
                        <span>{formatTaskCount(locale, tasks.length)}</span>
                      </div>
                      <div className="month-cell-list">
                        {tasks.map((task) => (
                          <button
                            key={task.id}
                            type="button"
                            className={`month-task-chip priority-${task.priority}${task.status === "done" ? " done" : ""}${justCompletedTaskId === task.id ? " just-done" : ""}`}
                            data-cheer={justCompletedTaskId === task.id ? justCompletedCheer : undefined}
                            onClick={() => onEdit(task)}
                            title={`${task.start}-${task.end} | ${task.title} (${getStatusLabel(locale, task.status)}, ${copy.priorityWord} ${getPriorityLabel(locale, task.priority)})`}
                          >
                            <span className="month-task-time">{task.start}</span>
                            <span className="month-task-title">{task.title}</span>
                          </button>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : (
            <div
              className={`timeline-wrap${drag ? " dragging" : ""}`}
              onPointerMove={onDragMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <div className="timeline-scroll-inner">
                {isRangeMode ? (
                  <div
                    className="timeline-columns-header"
                    style={{ gridTemplateColumns: `${TIMELINE_GUTTER}px repeat(${rangeDates.length}, minmax(0, 1fr))` }}
                  >
                    <div className="timeline-columns-spacer" />
                    {rangeDates.map((item) => (
                      <div
                        key={item.date}
                        className={`timeline-column-head${item.date === state.today ? " today" : ""}`}
                        title={formatDisplayDate(item.date, locale)}
                      >
                        <strong>{item.label}</strong>
                        <span>{item.subLabel}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div
                  className={`timeline${isRangeMode ? " timeline-range" : ""}`}
                  style={{
                    "--timeline-column-width": isRangeMode ? rangeColumnWidthCss : `${dayColumnWidth}px`,
                    "--timeline-grid-start": `${TIMELINE_GUTTER}px`,
                  }}
                >
                  {Array.from({ length: 24 }).map((_, hour) => (
                    <div key={hour} className="hour-label" style={{ top: `${hour * HOUR_HEIGHT + 2}px` }}>
                      {String(hour).padStart(2, "0")}:00
                    </div>
                  ))}

                  {visibleTasks.map((task) => {
                    const start = toMinutes(task.start);
                    const end = toMinutes(task.end);
                    const height = ((end - start) / 60) * HOUR_HEIGHT;
                    const top = (start / 60) * HOUR_HEIGHT;
                    const isTiny = height < 112;
                    const isCompact = height < 148;
                    const goalTitle = task.goalId ? goalTitleById.get(task.goalId) : "";

                    return (
                      <article
                        key={task.id}
                        className={`task-card priority-${task.priority}${task.status === "done" ? " done" : ""}${justCompletedTaskId === task.id ? " just-done" : ""}${isCompact ? " compact" : ""}${isTiny ? " tiny" : ""}${isRangeMode && isTiny ? " week-tiny" : ""}${editingId === task.id ? " editing" : ""}`}
                        data-cheer={justCompletedTaskId === task.id ? justCompletedCheer : undefined}
                        style={getTaskStyle(task, top, height)}
                        onPointerDown={(event) => onDragStart(event, task)}
                        onDoubleClick={() => onEdit(task)}
                      >
                      {isRangeMode && isTiny ? (
                        <div className="task-week-mini">
                          <strong title={`${task.title} (${task.start} - ${task.end})`}>{task.title}</strong>
                          <span className="task-week-mini-time">
                            {task.start} - {task.end}
                          </span>
                        </div>
                      ) : isTiny ? (
                        <div className="task-tiny-row">
                          <strong title={`${task.title} (${task.start} - ${task.end})`}>
                            {task.title} · {task.start} - {task.end}
                          </strong>
                          <div className="task-meta-row task-meta-row-tiny">
                            {goalTitle ? (
                              <span className="badge task-goal-badge task-goal-badge-tiny" title={`${copy.goalPrefix}: ${goalTitle}`}>
                                {goalTitle}
                              </span>
                            ) : null}
                            <span className={`badge task-priority-badge priority-${task.priority}`}>
                              {getPriorityLabel(locale, task.priority)}
                            </span>
                            <span className="badge task-status-badge">{getStatusLabel(locale, task.status)}</span>
                            <label className="task-check tiny" title={copy.doneCheckTitle}>
                              <input
                                type="checkbox"
                                checked={task.status === "done"}
                                onChange={(event) => onToggleTaskDone(task.id, event.target.checked)}
                              />
                            </label>
                            <div className="task-action-buttons">
                              <button className="task-action-btn" type="button" onClick={() => onEdit(task)}>
                                {copy.edit}
                              </button>
                              <button
                                className="task-action-btn danger"
                                type="button"
                                onClick={() => actions.deleteTask(task.id)}
                              >
                                {copy.delete}
                              </button>
                              {editingId === task.id ? (
                                <button
                                  className="task-action-btn task-action-btn-icon task-cancel-edit-btn"
                                  type="button"
                                  aria-label={copy.cancelEdit}
                                  title={copy.cancelEdit}
                                  onClick={resetEdit}
                                >
                                  <Image src={cancelIcon} alt="" width={14} height={14} />
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <header className="task-head">
                            <strong title={task.title}>{task.title}</strong>
                            <div className="task-head-badges">
                              {goalTitle ? (
                                <span className="badge task-goal-badge task-goal-badge-head" title={goalTitle}>
                                  {copy.goalPrefix}: {goalTitle}
                                </span>
                              ) : null}
                              <span className={`badge task-priority-badge priority-${task.priority}`}>
                                {getPriorityLabel(locale, task.priority)}
                              </span>
                            </div>
                          </header>

                          <div className="task-meta-row">
                            <span className="task-time">
                              {task.start} - {task.end}
                            </span>
                            <div className="task-meta-right">
                              <span className="badge task-status-badge">{getStatusLabel(locale, task.status)}</span>
                            </div>
                          </div>
                        </>
                      )}

                      {!isTiny ? (
                        <div className="task-actions">
                          <label className="task-check">
                            <input
                              type="checkbox"
                              checked={task.status === "done"}
                              onChange={(event) => onToggleTaskDone(task.id, event.target.checked)}
                            />
                            {isCompact ? null : <span>{copy.completedLabel}</span>}
                          </label>
                          <div className="task-action-buttons">
                            <button className="task-action-btn" type="button" onClick={() => onEdit(task)}>
                              {copy.edit}
                            </button>
                            <button
                              className="task-action-btn danger"
                              type="button"
                              onClick={() => actions.deleteTask(task.id)}
                            >
                              {copy.delete}
                            </button>
                            {editingId === task.id ? (
                              <button
                                className="task-action-btn task-action-btn-icon task-cancel-edit-btn"
                                type="button"
                                aria-label={copy.cancelEdit}
                                title={copy.cancelEdit}
                                onClick={resetEdit}
                              >
                                <Image src={cancelIcon} alt="" width={14} height={14} />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
