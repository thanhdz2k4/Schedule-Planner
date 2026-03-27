"use client";

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { BarChart, LineChart } from "@/components/SimpleCharts";
import StatsGrid from "@/components/StatsGrid";
import { usePlannerData } from "@/hooks/usePlannerData";
import { useUiLocale } from "@/hooks/useUiLocale";
import { daysRemaining, formatDate, getStats, priorityLabel, statusLabel, taskDurationMinutes } from "@/lib/plannerStore";

const COPY = {
  vi: {
    options: { day: "Ngày", month: "Tháng", year: "Năm" },
    chartDay: "Ngày: số giờ trong 7 ngày gần nhất",
    chartMonth: "Tháng: xu hướng năng suất",
    chartYear: "Năm: so sánh theo tháng",
    statsTitle: "Tổng Quan Số Liệu",
    statsSub: "Theo dõi nhanh tiến độ và thời lượng làm việc",
    statsAria: "Mốc thống kê",
    totalTask: "Tổng task",
    doneTask: "Task hoàn thành",
    doneRate: "Tỷ lệ hoàn thành",
    totalHours: "Tổng giờ",
    todayTask: "Task hôm nay",
    noTodayTask: "Chưa có task hôm nay.",
    weeklyGoals: "Mục Tiêu Tuần",
    deadline: "Hạn chót",
    weekWarning: "Sắp hết tuần nhưng mục tiêu chưa đạt.",
    noGoals: "Chưa có mục tiêu tuần.",
  },
  en: {
    options: { day: "Day", month: "Month", year: "Year" },
    chartDay: "Day: working hours in the last 7 days",
    chartMonth: "Month: productivity trend",
    chartYear: "Year: comparison by month",
    statsTitle: "Overview Stats",
    statsSub: "Quickly track progress and working time",
    statsAria: "Analytics period",
    totalTask: "Total tasks",
    doneTask: "Completed tasks",
    doneRate: "Completion rate",
    totalHours: "Total hours",
    todayTask: "Today tasks",
    noTodayTask: "No task for today.",
    weeklyGoals: "Weekly goals",
    deadline: "Deadline",
    weekWarning: "Week is ending but goal is not completed yet.",
    noGoals: "No weekly goals yet.",
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

export default function DashboardPage() {
  const { loaded, darkMode, state, actions } = usePlannerData();
  const [locale] = useUiLocale();
  const [analyticsView, setAnalyticsView] = useState("day");
  const copy = COPY[locale] || COPY.vi;
  const tasks = state?.tasks || [];
  const goals = state?.goals || [];
  const today = state?.today || "";

  const analyticsOptions = useMemo(
    () => [
      { value: "day", label: copy.options.day },
      { value: "month", label: copy.options.month },
      { value: "year", label: copy.options.year },
    ],
    [copy.options.day, copy.options.month, copy.options.year]
  );

  const stats = getStats(tasks);
  const day = useMemo(() => getDaySeries(tasks, locale), [tasks, locale]);
  const month = useMemo(() => getMonthSeries(tasks), [tasks]);
  const year = useMemo(() => getYearSeries(tasks), [tasks]);
  const chartByView = useMemo(
    () => ({
      day: {
        title: copy.chartDay,
        chartType: "bar",
        series: day,
      },
      month: {
        title: copy.chartMonth,
        chartType: "line",
        series: month,
      },
      year: {
        title: copy.chartYear,
        chartType: "bar",
        series: year,
      },
    }),
    [copy.chartDay, copy.chartMonth, copy.chartYear, day, month, year]
  );
  const currentChart = chartByView[analyticsView] || chartByView.day;
  const SelectedChart = currentChart.chartType === "line" ? LineChart : BarChart;
  const todayTasks = tasks.filter((task) => task.date === today);

  if (!loaded) {
    return null;
  }

  return (
    <AppShell
      title={{ vi: "Bảng Điều Khiển", en: "Dashboard" }}
      subtitle={{
        vi: "Toàn cảnh hiệu suất theo ngày, tháng, năm",
        en: "Performance overview by day, month, and year",
      }}
      quote={{ vi: "Xây sự đều đặn, không tạo áp lực.", en: "Build consistency, not pressure." }}
      goalProgress={state.goalOverall}
      themeLabel={darkMode ? { vi: "Chế độ sáng", en: "Light mode" } : { vi: "Chế độ tối", en: "Dark mode" }}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel">
        <div className="panel-head">
          <h3>{copy.statsTitle}</h3>
          <p className="muted">{copy.statsSub}</p>
        </div>
        <StatsGrid
          items={[
            { label: copy.totalTask, value: stats.total },
            { label: copy.doneTask, value: stats.done },
            { label: copy.doneRate, value: `${stats.rate}%` },
            { label: copy.totalHours, value: `${stats.totalHours}h` },
          ]}
        />

        <div className="analytics-switcher" role="tablist" aria-label={copy.statsAria}>
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

        <div className="charts-grid charts-grid-single">
          <SelectedChart title={currentChart.title} labels={currentChart.series.labels} values={currentChart.series.values} />
        </div>
      </section>

      <section className="panel two-col">
        <article>
          <div className="panel-head">
            <h3>{copy.todayTask}</h3>
          </div>
          <div className="list-cards">
            {todayTasks.length ? (
              todayTasks.map((task) => (
                <div className={`mini-card task-item priority-${task.priority}`} key={task.id}>
                  <strong>{task.title}</strong>
                  <div>
                    {task.start} - {task.end}
                  </div>
                  <div className="muted">
                    <span className="badge">{statusLabel(task.status, locale)}</span>
                    <span className={`badge task-priority-pill priority-${task.priority}`}>
                      {priorityLabel(task.priority, locale)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="mini-card">{copy.noTodayTask}</div>
            )}
          </div>
        </article>

        <article>
          <div className="panel-head">
            <h3>{copy.weeklyGoals}</h3>
          </div>
          <div className="goal-list">
            {goals.length ? (
              goals.map((goal) => (
                <div className="goal-card" key={goal.id}>
                  <div className="goal-row">
                    <strong>{goal.title}</strong>
                    <span>
                      {goal.completed}/{goal.target}
                    </span>
                  </div>
                  <div className="progress">
                    <span style={{ width: `${goal.progress}%` }} />
                  </div>
                  <p className="muted">
                    {copy.deadline}: {formatDate(goal.deadline, locale)} · {goal.progress}%
                  </p>
                  {daysRemaining(goal.deadline) <= 2 && goal.progress < 100 ? (
                    <p className="reminder">{copy.weekWarning}</p>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="mini-card">{copy.noGoals}</div>
            )}
          </div>
        </article>
      </section>
    </AppShell>
  );
}

