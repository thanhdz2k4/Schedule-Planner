"use client";

import AppShell from "@/components/AppShell";
import { usePlannerData } from "@/hooks/usePlannerData";

function monthDays() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const dayCount = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: dayCount }, (_, index) => {
    const day = index + 1;
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  });
}

export default function CalendarPage() {
  const { loaded, darkMode, state, actions } = usePlannerData();
  if (!loaded) return null;

  const days = monthDays();

  return (
    <AppShell
      title="Calendar View"
      subtitle="Tháng hiện tại theo dạng lưới"
      quote="Visualize your workload distribution."
      goalProgress={state.goalOverall}
      themeLabel={darkMode ? "Light mode" : "Dark mode"}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel">
        <div className="panel-head">
          <h3>Lịch tháng</h3>
          <p className="muted">Mỗi ô hiển thị tổng task trong ngày</p>
        </div>
        <div className="calendar-grid">
          {days.map((day) => {
            const tasks = state.tasks.filter((task) => task.date === day);
            return (
              <article className="day-cell" key={day}>
                <strong>{day.slice(-2)}</strong>
                <p className="muted">{tasks.length} task</p>
                {tasks.slice(0, 2).map((task) => (
                  <div className="badge" key={task.id}>{task.start} {task.title}</div>
                ))}
              </article>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
