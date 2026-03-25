"use client";

import { useMemo } from "react";
import AppShell from "@/components/AppShell";
import { usePlannerData } from "@/hooks/usePlannerData";
import { priorityLabel, statusLabel } from "@/lib/plannerStore";

const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function buildMonthCells(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const leadingEmptyCount = (firstDay.getDay() + 6) % 7;
  const dayCount = new Date(year, month + 1, 0).getDate();
  const today = now.toISOString().slice(0, 10);
  const monthLabel = now.toLocaleDateString("vi-VN", {
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
  const { cells, today, monthLabel } = useMemo(() => buildMonthCells(), []);
  const goalTitleById = useMemo(
    () => new Map(state.goals.map((goal) => [goal.id, goal.title])),
    [state.goals]
  );

  if (!loaded) return null;

  return (
    <AppShell
      title="Lịch Tháng"
      subtitle="Tổng quan task theo từng ngày trong tháng"
      quote="Visualize your workload distribution."
      goalProgress={state.goalOverall}
      themeLabel={darkMode ? "Chế độ sáng" : "Chế độ tối"}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel">
        <div className="panel-head">
          <h3>Lịch Công Việc · {monthLabel}</h3>
          <p className="muted">Hover vào ô ngày để xem toàn bộ task</p>
        </div>

        <div className="calendar-weekdays">
          {WEEKDAY_LABELS.map((label) => (
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
                  {isToday ? <span className="badge">Hôm nay</span> : null}
                </div>

                {tasks.length ? (
                  <>
                    <div className="day-stats">
                      <span>{tasks.length} task</span>
                      <span>{doneCount} xong</span>
                      <span>{openCount} còn lại</span>
                    </div>
                    {highCount > 0 ? <p className="day-high">Ưu tiên cao: {highCount}</p> : null}
                    {preview.map((task) => (
                      <div className={`badge task-chip priority-${task.priority}`} key={task.id}>
                        {task.start} · {task.title}
                      </div>
                    ))}
                    {hiddenCount > 0 ? <div className="badge day-more-chip">+{hiddenCount} task khác</div> : null}

                    <div className="day-hover-panel">
                      <div className="day-hover-head">
                        <strong>Danh sách task ngày {cell.day}</strong>
                        <span className="badge">{tasks.length} task</span>
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
                                  {priorityLabel(task.priority)}
                                </span>
                                <span className="badge">{statusLabel(task.status)}</span>
                                {goalTitle ? (
                                  <span className="badge day-hover-goal" title={goalTitle}>
                                    Mục tiêu: {goalTitle}
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
                  <p className="muted">Trống</p>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}

