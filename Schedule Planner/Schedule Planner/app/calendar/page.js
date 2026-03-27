"use client";

import { useMemo } from "react";
import AppShell from "@/components/AppShell";
import { usePlannerData } from "@/hooks/usePlannerData";
import { useUiLocale } from "@/hooks/useUiLocale";
import { priorityLabel, statusLabel } from "@/lib/plannerStore";

const WEEKDAY_LABELS = {
  vi: ["T2", "T3", "T4", "T5", "T6", "T7", "CN"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

const COPY = {
  vi: {
    monthBoard: "Lịch Công Việc",
    hoverHint: "Hover vào ô ngày để xem toàn bộ task",
    today: "Hôm nay",
    done: "xong",
    remaining: "còn lại",
    highPriority: "Ưu tiên cao",
    moreTask: "task khác",
    dayTaskList: "Danh sách task ngày",
    goalPrefix: "Mục tiêu",
    emptyDay: "Trống",
    taskWord: "task",
  },
  en: {
    monthBoard: "Work Calendar",
    hoverHint: "Hover a day cell to view all tasks",
    today: "Today",
    done: "done",
    remaining: "remaining",
    highPriority: "High priority",
    moreTask: "more tasks",
    dayTaskList: "Task list for day",
    goalPrefix: "Goal",
    emptyDay: "Empty",
    taskWord: "tasks",
  },
};

function dateLocale(locale) {
  return locale === "en" ? "en-US" : "vi-VN";
}

function buildMonthCells(locale, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const leadingEmptyCount = (firstDay.getDay() + 6) % 7;
  const dayCount = new Date(year, month + 1, 0).getDate();
  const today = now.toISOString().slice(0, 10);
  const monthLabel = now.toLocaleDateString(dateLocale(locale), {
    month: "long",
    year: "numeric",
  });

  const cells = [];

  for (let index = 0; index < leadingEmptyCount; index += 1) {
    cells.push({
      key: `empty-leading-${index}`,
      date: "",
      day: "",
    });
  }

  for (let index = 0; index < dayCount; index += 1) {
    const day = index + 1;
    cells.push({
      key: `${year}-${month}-${day}`,
      date: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      day: String(day),
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      key: `empty-trailing-${cells.length}`,
      date: "",
      day: "",
    });
  }

  return { cells, today, monthLabel };
}

export default function CalendarPage() {
  const { loaded, darkMode, state, actions } = usePlannerData();
  const [locale] = useUiLocale();
  const copy = COPY[locale] || COPY.vi;
  const { cells, today, monthLabel } = useMemo(() => buildMonthCells(locale), [locale]);
  const goalTitleById = useMemo(
    () => new Map(state.goals.map((goal) => [goal.id, goal.title])),
    [state.goals]
  );

  if (!loaded) return null;

  return (
    <AppShell
      title={{ vi: "Lịch Tháng", en: "Monthly Calendar" }}
      subtitle={{ vi: "Tổng quan task theo từng ngày trong tháng", en: "Monthly overview of tasks by day" }}
      quote={{ vi: "Trực quan hóa phân bổ khối lượng công việc.", en: "Visualize your workload distribution." }}
      goalProgress={state.goalOverall}
      themeLabel={darkMode ? { vi: "Chế độ sáng", en: "Light mode" } : { vi: "Chế độ tối", en: "Dark mode" }}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel">
        <div className="panel-head">
          <h3>
            {copy.monthBoard} · {monthLabel}
          </h3>
          <p className="muted">{copy.hoverHint}</p>
        </div>

        <div className="calendar-weekdays">
          {(WEEKDAY_LABELS[locale] || WEEKDAY_LABELS.vi).map((label) => (
            <div key={label} className="weekday-cell">
              {label}
            </div>
          ))}
        </div>

        <div className="calendar-grid">
          {cells.map((cell) => {
            if (!cell.date) {
              return <article className="day-cell empty" key={cell.key} aria-hidden="true" />;
            }

            const tasks = state.tasks
              .filter((task) => task.date === cell.date)
              .sort((a, b) => a.start.localeCompare(b.start));
            const doneCount = tasks.filter((task) => task.status === "done").length;
            const openCount = tasks.length - doneCount;
            const highCount = tasks.filter((task) => task.priority === "high" && task.status !== "done").length;
            const preview = tasks.slice(0, 2);
            const hiddenCount = tasks.length - preview.length;
            const isToday = cell.date === today;

            return (
              <article
                className={`day-cell${isToday ? " today" : ""}${tasks.length ? " has-tasks" : ""}`}
                key={cell.key}
                tabIndex={tasks.length ? 0 : -1}
              >
                <div className="day-cell-head">
                  <strong>{cell.day}</strong>
                  {isToday ? <span className="badge">{copy.today}</span> : null}
                </div>

                {tasks.length ? (
                  <>
                    <div className="day-stats">
                      <span>
                        {tasks.length} {copy.taskWord}
                      </span>
                      <span>
                        {doneCount} {copy.done}
                      </span>
                      <span>
                        {openCount} {copy.remaining}
                      </span>
                    </div>
                    {highCount > 0 ? (
                      <p className="day-high">
                        {copy.highPriority}: {highCount}
                      </p>
                    ) : null}
                    {preview.map((task) => (
                      <div className={`badge task-chip priority-${task.priority}`} key={task.id}>
                        {task.start} · {task.title}
                      </div>
                    ))}
                    {hiddenCount > 0 ? (
                      <div className="badge day-more-chip">
                        +{hiddenCount} {copy.moreTask}
                      </div>
                    ) : null}

                    <div className="day-hover-panel">
                      <div className="day-hover-head">
                        <strong>
                          {copy.dayTaskList} {cell.day}
                        </strong>
                        <span className="badge">
                          {tasks.length} {copy.taskWord}
                        </span>
                      </div>
                      <div className="day-hover-list">
                        {tasks.map((task) => {
                          const goalTitle = task.goalId ? goalTitleById.get(task.goalId) : "";
                          return (
                            <article className="day-hover-item" key={`${cell.key}-${task.id}`}>
                              <div className="day-hover-main">
                                <span className="day-hover-time">
                                  {task.start} - {task.end}
                                </span>
                                <strong title={task.title}>{task.title}</strong>
                              </div>
                              <div className="day-hover-meta">
                                <span className={`badge task-chip priority-${task.priority}`}>
                                  {priorityLabel(task.priority, locale)}
                                </span>
                                <span className="badge">{statusLabel(task.status, locale)}</span>
                                {goalTitle ? (
                                  <span className="badge day-hover-goal" title={goalTitle}>
                                    {copy.goalPrefix}: {goalTitle}
                                  </span>
                                ) : null}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="muted">{copy.emptyDay}</p>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}

