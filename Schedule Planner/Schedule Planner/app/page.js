"use client";

import AppShell from "@/components/AppShell";
import { BarChart, LineChart } from "@/components/SimpleCharts";
import StatsGrid from "@/components/StatsGrid";
import { usePlannerData } from "@/hooks/usePlannerData";
import { daysRemaining, formatDate, getStats, priorityLabel, statusLabel, taskDurationMinutes } from "@/lib/plannerStore";

function getWeekSeries(tasks) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));

  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const values = labels.map((_, index) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + index);
    const key = d.toISOString().slice(0, 10);
    const mins = tasks
      .filter((task) => task.date === key)
      .reduce((sum, task) => sum + taskDurationMinutes(task), 0);
    return Number((mins / 60).toFixed(1));
  });

  return { labels, values };
}

function getMonthSeries(tasks) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const dayCount = new Date(year, month + 1, 0).getDate();

  const labels = [];
  const values = [];

  for (let day = 1; day <= dayCount; day++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const mins = tasks
      .filter((task) => task.date === key)
      .reduce((sum, task) => sum + taskDurationMinutes(task), 0);

    labels.push(String(day));
    values.push(Number((mins / 60).toFixed(1)));
  }

  return { labels, values };
}

function getYearSeries(tasks) {
  const year = new Date().getFullYear();
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const values = labels.map((_, monthIndex) => {
    const mins = tasks
      .filter((task) => {
        const date = new Date(task.date);
        return date.getFullYear() === year && date.getMonth() === monthIndex;
      })
      .reduce((sum, task) => sum + taskDurationMinutes(task), 0);

    return Number((mins / 60).toFixed(1));
  });

  return { labels, values };
}

export default function DashboardPage() {
  const { loaded, darkMode, state, actions } = usePlannerData();

  if (!loaded) {
    return null;
  }

  const stats = getStats(state.tasks);
  const week = getWeekSeries(state.tasks);
  const month = getMonthSeries(state.tasks);
  const year = getYearSeries(state.tasks);
  const todayTasks = state.tasks.filter((task) => task.date === state.today);

  return (
    <AppShell
      title="Bảng Điều Khiển"
      subtitle="Toàn cảnh hiệu suất theo ngày, tuần, tháng"
      quote="Build consistency, not pressure."
      goalProgress={state.goalOverall}
      themeLabel={darkMode ? "Chế độ sáng" : "Chế độ tối"}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel">
        <div className="panel-head">
          <h3>Tổng Quan Số Liệu</h3>
          <p className="muted">Theo dõi nhanh tiến độ và thời lượng làm việc</p>
        </div>
        <StatsGrid
          items={[
            { label: "Tổng task", value: stats.total },
            { label: "Task hoàn thành", value: stats.done },
            { label: "Tỷ lệ hoàn thành", value: `${stats.rate}%` },
            { label: "Tổng giờ", value: `${stats.totalHours}h` },
          ]}
        />

        <div className="charts-grid">
          <BarChart title="Tuần: số giờ theo ngày" labels={week.labels} values={week.values} />
          <LineChart title="Tháng: xu hướng năng suất" labels={month.labels} values={month.values} />
          <BarChart title="Năm: so sánh theo tháng" labels={year.labels} values={year.values} />
        </div>
      </section>

      <section className="panel two-col">
        <article>
          <div className="panel-head">
            <h3>Task hôm nay</h3>
          </div>
          <div className="list-cards">
            {todayTasks.length ? (
              todayTasks.map((task) => (
                <div className={`mini-card task-item priority-${task.priority}`} key={task.id}>
                  <strong>{task.title}</strong>
                  <div>{task.start} - {task.end}</div>
                  <div className="muted">
                    <span className="badge">{statusLabel(task.status)}</span>
                    <span className={`badge task-priority-pill priority-${task.priority}`}>{priorityLabel(task.priority)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="mini-card">Chưa có task hôm nay.</div>
            )}
          </div>
        </article>

        <article>
          <div className="panel-head">
            <h3>Mục Tiêu Tuần</h3>
          </div>
          <div className="goal-list">
            {state.goals.length ? (
              state.goals.map((goal) => (
                <div className="goal-card" key={goal.id}>
                  <div className="goal-row">
                    <strong>{goal.title}</strong>
                    <span>{goal.completed}/{goal.target}</span>
                  </div>
                  <div className="progress"><span style={{ width: `${goal.progress}%` }} /></div>
                  <p className="muted">Hạn chót: {formatDate(goal.deadline)} · {goal.progress}%</p>
                  {daysRemaining(goal.deadline) <= 2 && goal.progress < 100 ? (
                    <p className="reminder">Sắp hết tuần nhưng mục tiêu chưa đạt.</p>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="mini-card">Chưa có mục tiêu tuần.</div>
            )}
          </div>
        </article>
      </section>
    </AppShell>
  );
}

