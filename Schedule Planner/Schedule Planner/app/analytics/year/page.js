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
    totalHours: "Tổng giờ",
    topMonth: "Tháng nổi bật",
    chartTitle: "Số giờ làm việc theo tháng",
  },
  en: {
    totalTask: "Total tasks",
    doneTask: "Completed tasks",
    totalHours: "Total hours",
    topMonth: "Top month",
    chartTitle: "Working hours by month",
  },
};

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
  const [locale] = useUiLocale();
  const copy = COPY[locale] || COPY.vi;
  if (!loaded) return null;

  const thisYear = new Date().getFullYear();
  const tasks = state.tasks.filter((task) => new Date(task.date).getFullYear() === thisYear);
  const stats = getStats(tasks);

  const series = yearSeries(state.tasks);
  const bestMonthIndex = series.values.indexOf(Math.max(...series.values));

  return (
    <AppShell
      title={{ vi: "Thống Kê Năm", en: "Yearly Analytics" }}
      subtitle={{ vi: "So sánh hiệu suất theo tháng", en: "Compare performance by month" }}
      quote={{ vi: "Xem xu hướng năm rồi điều chỉnh theo tuần.", en: "Review yearly trends, then adjust weekly." }}
      goalProgress={state.goalOverall}
      themeLabel={darkMode ? { vi: "Chế độ sáng", en: "Light mode" } : { vi: "Chế độ tối", en: "Dark mode" }}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel">
        <StatsGrid
          items={[
            { label: copy.totalTask, value: stats.total },
            { label: copy.doneTask, value: stats.done },
            { label: copy.totalHours, value: `${stats.totalHours}h` },
            {
              label: copy.topMonth,
              value: series.values[bestMonthIndex] > 0 ? series.labels[bestMonthIndex] : "--",
            },
          ]}
        />
        <BarChart title={copy.chartTitle} labels={series.labels} values={series.values} />
      </section>
    </AppShell>
  );
}

