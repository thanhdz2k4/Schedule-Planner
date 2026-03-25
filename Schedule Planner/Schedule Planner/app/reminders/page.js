"use client";

import AppShell from "@/components/AppShell";
import { usePlannerData } from "@/hooks/usePlannerData";
import { daysRemaining, formatDate } from "@/lib/plannerStore";

export default function RemindersPage() {
  const { loaded, darkMode, state, actions } = usePlannerData();
  if (!loaded) return null;

  const upcomingTasks = state.tasks
    .filter((task) => task.status !== "done")
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))
    .slice(0, 12);

  const warningGoals = state.goals.filter((goal) => daysRemaining(goal.deadline) <= 2 && goal.progress < 100);

  return (
    <AppShell
      title="Reminders"
      subtitle="Nhắc việc và goal cần chú ý"
      quote="Reminders keep intentions alive."
      goalProgress={state.goalOverall}
      themeLabel={darkMode ? "Light mode" : "Dark mode"}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel two-col">
        <article>
          <div className="panel-head">
            <h3>Upcoming Tasks</h3>
          </div>
          <div className="reminder-list">
            {upcomingTasks.length ? (
              upcomingTasks.map((task) => (
                <div className="mini-card" key={task.id}>
                  <strong>{task.title}</strong>
                  <div>{formatDate(task.date)} · {task.start} - {task.end}</div>
                  <div className="muted">Trạng thái: {task.status}</div>
                </div>
              ))
            ) : (
              <div className="mini-card">Không có task đang chờ.</div>
            )}
          </div>
        </article>

        <article>
          <div className="panel-head">
            <h3>Goal Warnings</h3>
          </div>
          <div className="reminder-list">
            {warningGoals.length ? (
              warningGoals.map((goal) => (
                <div className="goal-card" key={goal.id}>
                  <strong>{goal.title}</strong>
                  <div>{goal.completed}/{goal.target} · {goal.progress}%</div>
                  <p className="reminder">Còn {daysRemaining(goal.deadline)} ngày tới deadline ({formatDate(goal.deadline)}).</p>
                </div>
              ))
            ) : (
              <div className="mini-card">Không có goal cảnh báo.</div>
            )}
          </div>
        </article>
      </section>
    </AppShell>
  );
}
