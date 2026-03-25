"use client";

import AppShell from "@/components/AppShell";
import { LineChart } from "@/components/SimpleCharts";
import StatsGrid from "@/components/StatsGrid";
import { usePlannerData } from "@/hooks/usePlannerData";
import { formatDate, getStats, taskDurationMinutes } from "@/lib/plannerStore";

function monthSeries(tasks) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const count = new Date(year, month + 1, 0).getDate();

  const labels = [];
  const values = [];

  for (let day = 1; day <= count; day++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const mins = tasks.filter((task) => task.date === key).reduce((sum, task) => sum + taskDurationMinutes(task), 0);
    labels.push(String(day));
    values.push(Number((mins / 60).toFixed(1)));
  }

  return { labels, values };
}

export default function AnalyticsMonthPage() {
  const { loaded, darkMode, state, actions } = usePlannerData();
  if (!loaded) return null;

  const now = new Date();
  const tasks = state.tasks.filter((task) => {
    const date = new Date(task.date);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });

  const stats = getStats(tasks);
  const series = monthSeries(state.tasks);

  const best = tasks
    .reduce((map, task) => {
      map[task.date] = (map[task.date] || 0) + taskDurationMinutes(task);
      return map;
    }, {});
  const bestEntry = Object.entries(best).sort((a, b) => b[1] - a[1])[0];

  return (
    <AppShell
      title="Thống Kê Tháng"
      subtitle="Xu hướng năng suất theo ngày"
      quote="Small daily wins compound monthly."
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
            { label: "Ngày hiệu quả nhất", value: bestEntry ? formatDate(bestEntry[0]) : "--" },
          ]}
        />
        <LineChart title="Năng suất theo ngày trong tháng" labels={series.labels} values={series.values} />
      </section>
    </AppShell>
  );
}

