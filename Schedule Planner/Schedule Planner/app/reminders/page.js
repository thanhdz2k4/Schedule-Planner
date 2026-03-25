"use client";

import AppShell from "@/components/AppShell";
import { usePlannerData } from "@/hooks/usePlannerData";
import { daysRemaining, formatDate, priorityLabel, statusLabel } from "@/lib/plannerStore";

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
      title="Nhắc Việc"
      subtitle="Những task và mục tiêu cần ưu tiên ngay"
      quote="Reminders keep intentions alive."
      goalProgress={state.goalOverall}
      themeLabel={darkMode ? "Chế độ sáng" : "Chế độ tối"}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel two-col">
        <article>
          <div className="panel-head">
            <h3>Task Sắp Đến Hạn</h3>
          </div>
          <div className="reminder-list">
            {upcomingTasks.length ? (
              upcomingTasks.map((task) => (
                <div className={`mini-card task-item priority-${task.priority}`} key={task.id}>
                  <strong>{task.title}</strong>
                  <div>{formatDate(task.date)} · {task.start} - {task.end}</div>
                  <div className="muted">
                    Trạng thái: {statusLabel(task.status)}
                    <span className={`badge task-priority-pill priority-${task.priority}`}>{priorityLabel(task.priority)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="mini-card">Không có task đang chờ.</div>
            )}
          </div>
        </article>

        <article>
          <div className="panel-head">
            <h3>Cảnh Báo Mục Tiêu</h3>
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

