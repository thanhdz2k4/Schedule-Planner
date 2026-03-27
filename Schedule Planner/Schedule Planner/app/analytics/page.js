"use client";

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { BarChart, LineChart } from "@/components/SimpleCharts";
import StatsGrid from "@/components/StatsGrid";
import { usePlannerData } from "@/hooks/usePlannerData";
import { getStats, taskDurationMinutes } from "@/lib/plannerStore";

const ANALYTICS_OPTIONS = [
  { value: "day", label: "Ngày" },
  { value: "month", label: "Tháng" },
  { value: "year", label: "Năm" },
];

function getDaySeries(tasks) {
  const now = new Date();
  const labels = [];
  const values = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - offset);
    const key = d.toISOString().slice(0, 10);
    const mins = tasks
      .filter((task) => task.date === key)
      .reduce((sum, task) => sum + taskDurationMinutes(task), 0);

    labels.push(
      d.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
      })
    );
    values.push(Number((mins / 60).toFixed(1)));
  }

  return { labels, values };
}

function getMonthSeries(tasks) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const dayCount = new Date(year, month + 1, 0).getDate();

  const labels = [];
  const values = [];

  for (let day = 1; day <= dayCount; day += 1) {
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

export default function AnalyticsPage() {
  const { loaded, darkMode, state, actions } = usePlannerData();
  const [analyticsView, setAnalyticsView] = useState("day");
  const tasks = state?.tasks || [];
  const today = state?.today || "";

  const daySeries = useMemo(() => getDaySeries(tasks), [tasks]);
  const monthSeries = useMemo(() => getMonthSeries(tasks), [tasks]);
  const yearSeries = useMemo(() => getYearSeries(tasks), [tasks]);

  const now = useMemo(() => new Date(), []);
  const tasksByView = useMemo(() => {
    const dayTasks = tasks.filter((task) => task.date === today);
    const monthTasks = tasks.filter((task) => {
      const date = new Date(task.date);
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    });
    const yearTasks = tasks.filter((task) => {
      const date = new Date(task.date);
      return date.getFullYear() === now.getFullYear();
    });

    return {
      day: dayTasks,
      month: monthTasks,
      year: yearTasks,
    };
  }, [now, tasks, today]);

  const statsByView = useMemo(
    () => ({
      day: getStats(tasksByView.day),
      month: getStats(tasksByView.month),
      year: getStats(tasksByView.year),
    }),
    [tasksByView.day, tasksByView.month, tasksByView.year]
  );

  const chartByView = useMemo(
    () => ({
      day: {
        title: "Ngày: số giờ trong 7 ngày gần nhất",
        chartType: "bar",
        series: daySeries,
      },
      month: {
        title: "Tháng: xu hướng năng suất",
        chartType: "line",
        series: monthSeries,
      },
      year: {
        title: "Năm: so sánh theo tháng",
        chartType: "bar",
        series: yearSeries,
      },
    }),
    [daySeries, monthSeries, yearSeries]
  );

  const currentChart = chartByView[analyticsView] || chartByView.day;
  const currentStats = statsByView[analyticsView] || statsByView.day;
  const SelectedChart = currentChart.chartType === "line" ? LineChart : BarChart;

  if (!loaded) {
    return null;
  }

  return (
    <AppShell
      title="Thống Kê"
      subtitle="Theo dõi hiệu suất theo ngày, tháng, năm"
      quote="Measure the rhythm, then optimize it."
      goalProgress={state.goalOverall}
      themeLabel={darkMode ? "Chế độ sáng" : "Chế độ tối"}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel">
        <div className="panel-head">
          <h3>Bảng Thống Kê Tổng Hợp</h3>
          <p className="muted">Một slider duy nhất cho ngày, tháng và năm</p>
        </div>

        <div className="analytics-switcher" role="tablist" aria-label="Mốc thống kê">
          {ANALYTICS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={analyticsView === option.value}
              className={`analytics-switcher-btn${analyticsView === option.value ? " active" : ""}`}
              onClick={() => setAnalyticsView(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <StatsGrid
          items={[
            { label: "Tổng task", value: currentStats.total },
            { label: "Task hoàn thành", value: currentStats.done },
            { label: "Tỷ lệ hoàn thành", value: `${currentStats.rate}%` },
            { label: "Tổng giờ", value: `${currentStats.totalHours}h` },
          ]}
        />

        <div className="charts-grid charts-grid-single">
          <SelectedChart title={currentChart.title} labels={currentChart.series.labels} values={currentChart.series.values} />
        </div>
      </section>
    </AppShell>
  );
}
