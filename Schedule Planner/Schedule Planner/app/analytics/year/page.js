"use client";

import AppShell from "@/components/AppShell";
import { BarChart } from "@/components/SimpleCharts";
import StatsGrid from "@/components/StatsGrid";
import { usePlannerData } from "@/hooks/usePlannerData";
import { getStats, taskDurationMinutes } from "@/lib/plannerStore";

function yearSeries(tasks) {
  const year = new Date().getFullYear();
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const values = labels.map((_, index) => {
    const mins = tasks
      .filter((task) => {
        const d = new Date(task.date);
        return d.getFullYear() === year && d.getMonth() === index;
      })
      .reduce((sum, task) => sum + taskDurationMinutes(task), 0);

    return Number((mins / 60).toFixed(1));
  });

  return { labels, values };
}

export default function AnalyticsYearPage() {
  const { loaded, darkMode, state, actions } = usePlannerData();
  if (!loaded) return null;

  const thisYear = new Date().getFullYear();
  const tasks = state.tasks.filter((task) => new Date(task.date).getFullYear() === thisYear);
  const stats = getStats(tasks);

  const series = yearSeries(state.tasks);
  const bestMonthIndex = series.values.indexOf(Math.max(...series.values));

  return (
    <AppShell
      title="Thống Kê Năm"
      subtitle="So sánh hiệu suất theo tháng"
      quote="Review yearly trends, then adjust weekly."
      goalProgress={state.goalOverall}
      themeLabel={darkMode ? "Chế độ sáng" : "Chế độ tối"}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel">
        <StatsGrid
          items={[
            { label: "Tổng task", value: stats.total },
            { label: "Task hoàn thành", value: stats.done },
            { label: "Tổng giờ", value: `${stats.totalHours}h` },
            {
              label: "Tháng nổi bật",
              value: series.values[bestMonthIndex] > 0 ? series.labels[bestMonthIndex] : "--",
            },
          ]}
        />
        <BarChart title="Số giờ làm việc theo tháng" labels={series.labels} values={series.values} />
      </section>
    </AppShell>
  );
}

