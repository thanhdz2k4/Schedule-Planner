"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { usePlannerData } from "@/hooks/usePlannerData";
import { priorityLabel, statusLabel, toMinutes, todayISO } from "@/lib/plannerStore";

const HOUR_HEIGHT = 36;
const TIMELINE_GUTTER = 74;
const TIMELINE_RIGHT_PADDING = 22;
const WEEKDAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const CHEER_MESSAGES = ["Tuyệt vời!", "Xuất sắc!", "Hoàn thành!", "Rất tốt!", "Tuyệt cú mèo!"];

const VIEW_OPTIONS = [
  { value: "day", label: "Ngày" },
  { value: "week", label: "Tuần" },
  { value: "month", label: "Tháng" },
];

const VIEW_META = {
  day: {
    title: "Timeline Ngày",
    subtitle: "Sắp lịch theo giờ, không cho phép trùng task",
    panelTitle: "Lịch Làm Việc Theo Ngày",
  },
  week: {
    title: "Timeline Tuần",
    subtitle: "Theo dõi toàn bộ task trong tuần trên cùng một timeline",
    panelTitle: "Lịch Làm Việc Theo Tuần",
  },
  month: {
    title: "Lịch Làm Việc Tháng",
    subtitle: "Hiển thị dạng bảng tháng đầy đủ để xem task rõ ràng",
    panelTitle: "Lịch Làm Việc Theo Tháng",
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

function formatDisplayDate(isoDate) {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function getDayWeekRangeDates(mode, anchorISODate) {
  const anchor = parseISODate(anchorISODate) || parseISODate(todayISO()) || new Date();

  if (mode === "week") {
    const monday = startOfWeekMonday(anchor);
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(monday, index);
      return {
        date: toISODate(date),
        label: WEEKDAY_SHORT[date.getDay()],
        subLabel: `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`,
      };
    });
  }

  return [
    {
      date: toISODate(anchor),
      label: formatDisplayDate(toISODate(anchor)),
      subLabel: WEEKDAY_SHORT[anchor.getDay()],
    },
  ];
}

function buildMonthBoard(anchorISODate) {
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
      weekday: WEEKDAY_SHORT[day.getDay()],
      inCurrentMonth: day.getMonth() === monthStart.getMonth(),
    });
  }

  const monthLabel = monthStart.toLocaleDateString("vi-VN", {
    month: "long",
    year: "numeric",
  });

  return { monthLabel, cells };
}

function getRangeLabel(mode, dates, monthBoard) {
  if (mode === "month") return monthBoard.monthLabel;
  if (!dates.length) return "";
  if (mode === "day") return formatDisplayDate(dates[0].date);
  return `${formatDisplayDate(dates[0].date)} - ${formatDisplayDate(dates[dates.length - 1].date)}`;
}

export default function DailyPage() {
  const { loaded, darkMode, state, actions } = usePlannerData();
  const [timelineMode, setTimelineMode] = useState("day");
  const [alert, setAlert] = useState("");
  const [editingId, setEditingId] = useState("");
  const [drag, setDrag] = useState(null);
  const [justCompletedTaskId, setJustCompletedTaskId] = useState("");
  const [justCompletedCheer, setJustCompletedCheer] = useState(CHEER_MESSAGES[0]);
  const completionEffectTimeoutRef = useRef(null);
  const [form, setForm] = useState({
    date: todayISO(),
    title: "",
    start: "08:00",
    end: "09:00",
    status: "todo",
    priority: "medium",
    goalId: "",
  });

  const goalTitleById = useMemo(
    () => new Map(state.goals.map((goal) => [goal.id, goal.title])),
    [state.goals]
  );
  const monthBoard = useMemo(() => buildMonthBoard(form.date), [form.date]);
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
    return getDayWeekRangeDates(timelineMode, form.date);
  }, [timelineMode, form.date]);
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

  const isTimelineMode = timelineMode !== "month";
  const isRangeMode = timelineMode === "week";
  const columnWidth = timelineMode === "week" ? 230 : 120;
  const timelineWidth = TIMELINE_GUTTER + rangeDates.length * columnWidth + TIMELINE_RIGHT_PADDING;
  const rangeLabel = getRangeLabel(timelineMode, rangeDates, monthBoard);
  const viewMeta = VIEW_META[timelineMode] || VIEW_META.day;
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
    const scopeLabel =
      timelineMode === "month"
        ? "trong tháng này"
        : timelineMode === "week"
          ? "trong tuần này"
          : "trong ngày này";

    return { total, done, remaining, percent, scopeLabel };
  }, [state.tasks, timelineMode, monthCurrentDateSet, rangeDateSet]);

  useEffect(
    () => () => {
      if (completionEffectTimeoutRef.current) {
        clearTimeout(completionEffectTimeoutRef.current);
      }
    },
    []
  );

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
      setAlert("Vui lòng nhập tên task.");
      return;
    }

    if (toMinutes(form.end) <= toMinutes(form.start)) {
      setAlert("Giờ kết thúc phải lớn hơn giờ bắt đầu.");
      return;
    }

    const payload = { ...form, title: form.title.trim() };
    const result = editingId ? actions.updateTask(editingId, payload) : actions.addTask(payload);

    if (!result.ok) {
      setAlert(result.message);
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
        setJustCompletedCheer(CHEER_MESSAGES[0]);
      }
      return;
    }

    const randomCheer = CHEER_MESSAGES[Math.floor(Math.random() * CHEER_MESSAGES.length)];
    setJustCompletedCheer(randomCheer);
    setJustCompletedTaskId(taskId);
    if (completionEffectTimeoutRef.current) {
      clearTimeout(completionEffectTimeoutRef.current);
    }
    completionEffectTimeoutRef.current = setTimeout(() => {
      setJustCompletedTaskId("");
      setJustCompletedCheer(CHEER_MESSAGES[0]);
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
      setAlert(result.message);
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

    const left = TIMELINE_GUTTER + columnIndex * columnWidth + 6;
    const width = Math.max(92, columnWidth - 12);
    return { top, height, left, width };
  }

  return (
    <AppShell
      title={viewMeta.title}
      subtitle={viewMeta.subtitle}
      goalProgress={state.goalOverall}
      quote="Plan the day before it starts."
      themeLabel={darkMode ? "Chế độ sáng" : "Chế độ tối"}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel">
            <div className="timeline-progress-card timeline-progress-card-head" aria-live="polite">
              <div
                className="timeline-progress-donut"
                style={{ "--timeline-donut-progress": `${timelineProgress.percent * 3.6}deg` }}
              >
                <div className="timeline-progress-donut-inner">
                  <strong>{timelineProgress.percent}%</strong>
                  <span>Xong</span>
                </div>
              </div>
              <div className="timeline-progress-meta">
                <strong>
                  {timelineProgress.done}/{timelineProgress.total} task
                </strong>
                <span>
                  {timelineProgress.total === 0
                    ? `Chưa có task ${timelineProgress.scopeLabel}.`
                    : `Còn ${timelineProgress.remaining} task ${timelineProgress.scopeLabel}.`}
                </span>
              </div>
            </div>

        <div className="panel-head">
          <div>
            <h3>{viewMeta.panelTitle}</h3>
            <p className="muted">Thêm · Sửa · Xóa · Kéo thả đổi thời gian</p>
          </div>
          <div className="timeline-head-controls">
            <div className="timeline-view-toggle" role="tablist" aria-label="Chế độ timeline">
              {VIEW_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`timeline-view-btn${timelineMode === option.value ? " active" : ""}`}
                  onClick={() => setTimelineMode(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {timelineMode === "month" ? (
              <div className="month-nav">
                <button type="button" className="month-nav-btn" onClick={() => handleDateChange(todayISO())}>
                  Hôm nay
                </button>
                <button type="button" className="month-nav-btn" onClick={() => shiftMonth(-1)} aria-label="Tháng trước">
                  ‹
                </button>
                <strong className="month-nav-label">{monthBoard.monthLabel}</strong>
                <button type="button" className="month-nav-btn" onClick={() => shiftMonth(1)} aria-label="Tháng sau">
                  ›
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <form className="grid-form" onSubmit={submitTask}>
          <input type="date" value={form.date} onChange={(event) => handleDateChange(event.target.value)} required />
          <input type="text" placeholder="Tên task" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
          <input type="time" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} required />
          <input type="time" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} required />
          <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            <option value="todo">Chưa làm</option>
            <option value="doing">Đang làm</option>
            <option value="done">Hoàn thành</option>
          </select>
          <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
            <option value="high">Cao</option>
            <option value="medium">Trung bình</option>
            <option value="low">Thấp</option>
          </select>
          <select value={form.goalId} onChange={(event) => setForm({ ...form, goalId: event.target.value })}>
            <option value="">Không gắn mục tiêu</option>
            {state.goals.map((goal) => (
              <option value={goal.id} key={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
          <button className="btn" type="submit">
            {editingId ? "Cập nhật task" : "Thêm task"}
          </button>
        </form>

        {editingId ? (
          <button className="btn-link" type="button" onClick={resetEdit}>
            Hủy sửa
          </button>
        ) : null}
        {alert ? <p className="alert">{alert}</p> : null}
        <div className="timeline-summary">
          <p className="muted" style={{ marginTop: 8 }}>
            Đang xem: {rangeLabel}. Double-click vào task để mở sửa nhanh.
          </p>
        </div>

        {timelineMode === "month" ? (
          <div className="month-table-wrap">
            <div className="month-table-header">
              {WEEKDAY_SHORT.map((weekday) => (
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
                      <span>{tasks.length ? `${tasks.length} task` : ""}</span>
                    </div>
                    <div className="month-cell-list">
                      {tasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          className={`month-task-chip priority-${task.priority}${task.status === "done" ? " done" : ""}${justCompletedTaskId === task.id ? " just-done" : ""}`}
                          data-cheer={justCompletedTaskId === task.id ? justCompletedCheer : undefined}
                          onClick={() => onEdit(task)}
                          title={`${task.start}-${task.end} | ${task.title} (${statusLabel(task.status)}, ưu tiên ${priorityLabel(task.priority)})`}
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
            <div className="timeline-scroll-inner" style={isRangeMode ? { minWidth: `${timelineWidth}px` } : undefined}>
              {isRangeMode ? (
                <div
                  className="timeline-columns-header"
                  style={{ gridTemplateColumns: `${TIMELINE_GUTTER}px repeat(${rangeDates.length}, ${columnWidth}px)` }}
                >
                  <div className="timeline-columns-spacer" />
                  {rangeDates.map((item) => (
                    <div
                      key={item.date}
                      className={`timeline-column-head${item.date === state.today ? " today" : ""}`}
                      title={formatDisplayDate(item.date)}
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
                  "--timeline-column-width": `${columnWidth}px`,
                  "--timeline-grid-start": `${TIMELINE_GUTTER}px`,
                  ...(isRangeMode ? { minWidth: `${timelineWidth}px`, width: `${timelineWidth}px` } : {}),
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
                  const isTiny = height < 72;
                  const isCompact = height < 108;
                  const goalTitle = task.goalId ? goalTitleById.get(task.goalId) : "";

                  return (
                    <article
                      key={task.id}
                      className={`task-card priority-${task.priority}${task.status === "done" ? " done" : ""}${justCompletedTaskId === task.id ? " just-done" : ""}${isCompact ? " compact" : ""}${isTiny ? " tiny" : ""}`}
                      data-cheer={justCompletedTaskId === task.id ? justCompletedCheer : undefined}
                      style={getTaskStyle(task, top, height)}
                      onPointerDown={(event) => onDragStart(event, task)}
                      onDoubleClick={() => onEdit(task)}
                    >
                      {isTiny ? (
                        <div className="task-tiny-row">
                          <strong title={`${task.title} (${task.start} - ${task.end})`}>
                            {task.title} · {task.start} - {task.end}
                          </strong>
                          <div className="task-meta-row task-meta-row-tiny">
                            <span className={`badge task-priority-badge priority-${task.priority}`}>
                              {priorityLabel(task.priority)}
                            </span>
                            <span className="badge task-status-badge">{statusLabel(task.status)}</span>
                            {goalTitle ? (
                              <span className="badge task-goal-badge" title={goalTitle}>
                                Mục tiêu: {goalTitle}
                              </span>
                            ) : null}
                            <label className="task-check tiny" title="Đánh dấu hoàn thành">
                              <input
                                type="checkbox"
                                checked={task.status === "done"}
                                onChange={(event) => onToggleTaskDone(task.id, event.target.checked)}
                              />
                            </label>
                            <div className="task-action-buttons">
                              <button className="task-action-btn" type="button" onClick={() => onEdit(task)}>
                                Sửa
                              </button>
                              <button
                                className="task-action-btn danger"
                                type="button"
                                onClick={() => actions.deleteTask(task.id)}
                              >
                                Xóa
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <header className="task-head">
                            <strong title={task.title}>{task.title}</strong>
                            <span className={`badge task-priority-badge priority-${task.priority}`}>
                              {priorityLabel(task.priority)}
                            </span>
                          </header>

                          <div className="task-meta-row">
                            <span className="task-time">
                              {task.start} - {task.end}
                            </span>
                            <div className="task-meta-right">
                              <span className="badge task-status-badge">{statusLabel(task.status)}</span>
                              {goalTitle ? (
                                <span className="badge task-goal-badge" title={goalTitle}>
                                  Mục tiêu: {goalTitle}
                                </span>
                              ) : null}
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
                            {isCompact ? null : <span>Hoàn thành</span>}
                          </label>
                          <div className="task-action-buttons">
                            <button className="task-action-btn" type="button" onClick={() => onEdit(task)}>
                              Sửa
                            </button>
                            <button
                              className="task-action-btn danger"
                              type="button"
                              onClick={() => actions.deleteTask(task.id)}
                            >
                              Xóa
                            </button>
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
      </section>
    </AppShell>
  );
}

