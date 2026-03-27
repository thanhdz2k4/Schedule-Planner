"use client";

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { BarChart, LineChart } from "@/components/SimpleCharts";
import StatsGrid from "@/components/StatsGrid";
import { usePlannerData } from "@/hooks/usePlannerData";
import { useUiLocale } from "@/hooks/useUiLocale";
import { getStats, taskDurationMinutes } from "@/lib/plannerStore";

const COPY = {
  vi: {
    options: { day: "Ngày", month: "Tháng", year: "Năm" },
    panelTitle: "Bảng Thống Kê Tổng Hợp",
    panelSub: "Một slider duy nhất cho ngày, tháng và năm",
    periodAria: "Mốc thống kê",
    totalTask: "Tổng task",
    doneTask: "Task hoàn thành",
    rate: "Tỷ lệ hoàn thành",
    hours: "Tổng giờ",
    chartDay: "Ngày: số giờ trong 7 ngày gần nhất",
    chartMonth: "Tháng: xu hướng năng suất",
    chartYear: "Năm: so sánh theo tháng",
  },
  en: {
    options: { day: "Day", month: "Month", year: "Year" },
    panelTitle: "Combined Analytics",
    panelSub: "One switcher for day, month, and year",
    periodAria: "Analytics period",
    totalTask: "Total tasks",
    doneTask: "Completed tasks",
    rate: "Completion rate",
    hours: "Total hours",
    chartDay: "Day: working hours in the last 7 days",
    chartMonth: "Month: productivity trend",
    chartYear: "Year: comparison by month",
  },
};

function dateLocale(locale) {
  return locale === "en" ? "en-US" : "vi-VN";
}

function getDaySeries(tasks, locale) {
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
      d.toLocaleDateString(dateLocale(locale), {
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
  const [locale] = useUiLocale();
  const [analyticsView, setAnalyticsView] = useState("day");
  const copy = COPY[locale] || COPY.vi;
  const tasks = state?.tasks || [];
  const today = state?.today || "";

  const analyticsOptions = useMemo(
    () => [
      { value: "day", label: copy.options.day },
      { value: "month", label: copy.options.month },
      { value: "year", label: copy.options.year },
    ],
    [copy.options.day, copy.options.month, copy.options.year]
  );

  const daySeries = useMemo(() => getDaySeries(tasks, locale), [tasks, locale]);
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
        title: copy.chartDay,
        chartType: "bar",
        series: daySeries,
      },
      month: {
        title: copy.chartMonth,
        chartType: "line",
        series: monthSeries,
      },
      year: {
        title: copy.chartYear,
        chartType: "bar",
        series: yearSeries,
      },
    }),
    [copy.chartDay, copy.chartMonth, copy.chartYear, daySeries, monthSeries, yearSeries]
  );

  const currentChart = chartByView[analyticsView] || chartByView.day;
  const currentStats = statsByView[analyticsView] || statsByView.day;
  const SelectedChart = currentChart.chartType === "line" ? LineChart : BarChart;

  if (!loaded) {
    return null;
  }

  return (
    <AppShell
      title={{ vi: "Thống Kê", en: "Analytics" }}
      subtitle={{ vi: "Theo dõi hiệu suất theo ngày, tháng, năm", en: "Track performance by day, month, and year" }}
      quote={{ vi: "Đo nhịp độ trước, rồi tối ưu sau.", en: "Measure the rhythm, then optimize it." }}
      goalProgress={state.goalOverall}
      themeLabel={darkMode ? { vi: "Chế độ sáng", en: "Light mode" } : { vi: "Chế độ tối", en: "Dark mode" }}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel">
        <div className="panel-head">
          <h3>{copy.panelTitle}</h3>
          <p className="muted">{copy.panelSub}</p>
        </div>

        <div className="analytics-switcher" role="tablist" aria-label={copy.periodAria}>
          {analyticsOptions.map((option) => (
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
            { label: copy.totalTask, value: currentStats.total },
            { label: copy.doneTask, value: currentStats.done },
            { label: copy.rate, value: `${currentStats.rate}%` },
            { label: copy.hours, value: `${currentStats.totalHours}h` },
          ]}
        />

        <div className="charts-grid charts-grid-single">
          <SelectedChart title={currentChart.title} labels={currentChart.series.labels} values={currentChart.series.values} />
        </div>
      </section>
    </AppShell>
  );
}

