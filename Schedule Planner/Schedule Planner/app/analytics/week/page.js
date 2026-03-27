"use client";

import AppShell from "@/components/AppShell";
import { BarChart } from "@/components/SimpleCharts";
import StatsGrid from "@/components/StatsGrid";
import { usePlannerData } from "@/hooks/usePlannerData";
import { useUiLocale } from "@/hooks/useUiLocale";
import { getStats, taskDurationMinutes } from "@/lib/plannerStore";

const COPY = {
  vi: {
    totalTask: "Tổng task",
    doneTask: "Task hoàn thành",
    rate: "Tỷ lệ hoàn thành",
    hours: "Tổng giờ",
    chartTitle: "Số giờ làm việc theo ngày",
  },
  en: {
    totalTask: "Total tasks",
    doneTask: "Completed tasks",
    rate: "Completion rate",
    hours: "Total hours",
    chartTitle: "Working hours by day",
  },
};

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
  const [locale] = useUiLocale();
  const copy = COPY[locale] || COPY.vi;

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
      title={{ vi: "Thống Kê Tuần", en: "Weekly Analytics" }}
      subtitle={{ vi: "Hiệu suất làm việc trong 7 ngày gần nhất", en: "Work performance in the last 7 days" }}
      quote={{ vi: "Đo lường điều quan trọng mỗi tuần.", en: "Measure what matters every week." }}
      goalProgress={state.goalOverall}
      themeLabel={darkMode ? { vi: "Chế độ sáng", en: "Light mode" } : { vi: "Chế độ tối", en: "Dark mode" }}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel">
        <StatsGrid
          items={[
            { label: copy.totalTask, value: stats.total },
            { label: copy.doneTask, value: stats.done },
            { label: copy.rate, value: `${stats.rate}%` },
            { label: copy.hours, value: `${stats.totalHours}h` },
          ]}
        />
        <BarChart title={copy.chartTitle} labels={series.labels} values={series.values} />
      </section>
    </AppShell>
  );
}

