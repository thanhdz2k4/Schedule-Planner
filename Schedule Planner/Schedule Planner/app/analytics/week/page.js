"use client";

import AppShell from "@/components/AppShell";
import { BarChart } from "@/components/SimpleCharts";
import StatsGrid from "@/components/StatsGrid";
import { usePlannerData } from "@/hooks/usePlannerData";
import { getStats, taskDurationMinutes } from "@/lib/plannerStore";

function weekSeries(tasks) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));

  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const values = labels.map((_, index) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + index);
    const key = d.toISOString().slice(0, 10);
    const mins = tasks.filter((task) => task.date === key).reduce((sum, task) => sum + taskDurationMinutes(task), 0);
    return Number((mins / 60).toFixed(1));
  });

  return { labels, values };
}

export default function AnalyticsWeekPage() {
  const { loaded, darkMode, state, actions } = usePlannerData();

  if (!loaded) return null;

  const series = weekSeries(state.tasks);
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const weeklyTasks = state.tasks.filter((task) => {
    const date = new Date(task.date);
    return date >= monday && date <= sunday;
  });

  const stats = getStats(weeklyTasks);

  return (
    <AppShell
      title="Thống Kê Tuần"
      subtitle="Hiệu suất làm việc trong 7 ngày gần nhất"
      quote="Measure what matters every week."
      goalProgress={state.goalOverall}
      themeLabel={darkMode ? "Chế độ sáng" : "Chế độ tối"}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel">
        <StatsGrid
          items={[
            { label: "Tổng task", value: stats.total },
            { label: "Task hoàn thành", value: stats.done },
            { label: "Tỷ lệ hoàn thành", value: `${stats.rate}%` },
            { label: "Tổng giờ", value: `${stats.totalHours}h` },
          ]}
        />
        <BarChart title="Số giờ làm việc theo ngày" labels={series.labels} values={series.values} />
      </section>
    </AppShell>
  );
}

