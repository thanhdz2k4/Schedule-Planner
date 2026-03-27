"use client";

import AppShell from "@/components/AppShell";
import { LineChart } from "@/components/SimpleCharts";
import StatsGrid from "@/components/StatsGrid";
import { usePlannerData } from "@/hooks/usePlannerData";
import { useUiLocale } from "@/hooks/useUiLocale";
import { formatDate, getStats, taskDurationMinutes } from "@/lib/plannerStore";

const COPY = {
  vi: {
    totalTask: "Tổng task",
    doneTask: "Task hoàn thành",
    rate: "Tỷ lệ hoàn thành",
    bestDay: "Ngày hiệu quả nhất",
    chartTitle: "Năng suất theo ngày trong tháng",
  },
  en: {
    totalTask: "Total tasks",
    doneTask: "Completed tasks",
    rate: "Completion rate",
    bestDay: "Most productive day",
    chartTitle: "Productivity by day in the month",
  },
};

function monthSeries(tasks) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const count = new Date(year, month + 1, 0).getDate();

  const labels = [];
  const values = [];

  for (let day = 1; day <= count; day += 1) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const mins = tasks.filter((task) => task.date === key).reduce((sum, task) => sum + taskDurationMinutes(task), 0);
    labels.push(String(day));
    values.push(Number((mins / 60).toFixed(1)));
  }

  return { labels, values };
}

export default function AnalyticsMonthPage() {
  const { loaded, darkMode, state, actions } = usePlannerData();
  const [locale] = useUiLocale();
  const copy = COPY[locale] || COPY.vi;
  if (!loaded) return null;

  const now = new Date();
  const tasks = state.tasks.filter((task) => {
    const date = new Date(task.date);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });

  const stats = getStats(tasks);
  const series = monthSeries(state.tasks);

  const best = tasks.reduce((map, task) => {
    map[task.date] = (map[task.date] || 0) + taskDurationMinutes(task);
    return map;
  }, {});
  const bestEntry = Object.entries(best).sort((a, b) => b[1] - a[1])[0];

  return (
    <AppShell
      title={{ vi: "Thống Kê Tháng", en: "Monthly Analytics" }}
      subtitle={{ vi: "Xu hướng năng suất theo ngày", en: "Daily productivity trends" }}
      quote={{ vi: "Những chiến thắng nhỏ mỗi ngày sẽ cộng dồn theo tháng.", en: "Small daily wins compound monthly." }}
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
            { label: copy.bestDay, value: bestEntry ? formatDate(bestEntry[0], locale) : "--" },
          ]}
        />
        <LineChart title={copy.chartTitle} labels={series.labels} values={series.values} />
      </section>
    </AppShell>
  );
}

