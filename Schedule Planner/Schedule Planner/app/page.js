"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { BarChart, LineChart } from "@/components/SimpleCharts";
import StatsGrid from "@/components/StatsGrid";
import { usePlannerData } from "@/hooks/usePlannerData";
import { useUiLocale } from "@/hooks/useUiLocale";
import {
  daysRemaining,
  formatDate,
  getStats,
  priorityLabel,
  statusLabel,
  taskDurationMinutes,
} from "@/lib/plannerStore";

const COPY = {
  vi: {
    options: { day: "Ngày", month: "Tháng", year: "Năm" },
    chartDay: "Ngày: số giờ trong 7 ngày gần nhất",
    chartMonth: "Tháng: xu hướng năng suất theo ngày",
    chartYear: "Năm: so sánh theo tháng",
    statsTitle: "Tổng Quan Số Liệu",
    statsSub: "Theo dõi nhanh tiến độ và thời lượng làm việc",
    statsAria: "Mốc thống kê",
    totalTask: "Tổng task",
    doneTask: "Task hoàn thành",
    doneRate: "Tỷ lệ hoàn thành",
    totalHours: "Tổng giờ",
    selectedDayTask: "Task ngày đã chọn",
    noSelectedDayTask: "Không có task cho ngày đã chọn.",
    weeklyGoals: "Mục Tiêu Tuần",
    deadline: "Hạn chót",
    weekWarning: "Sắp hết tuần nhưng mục tiêu chưa đạt.",
    noGoals: "Chưa có mục tiêu tuần.",
    reportFilter: "Bộ Lọc Báo Cáo",
    reportByDay: "Theo ngày",
    reportByMonth: "Theo tháng",
    pickDate: "Chọn ngày",
    pickMonth: "Chọn tháng",
    scopeDayHint: "Thống kê đang tính theo ngày đã chọn.",
    scopeMonthHint: "Thống kê đang tính theo tháng đã chọn.",
  },
  en: {
    options: { day: "Day", month: "Month", year: "Year" },
    chartDay: "Day: working hours in the last 7 days",
    chartMonth: "Month: daily productivity trend",
    chartYear: "Year: comparison by month",
    statsTitle: "Overview Stats",
    statsSub: "Quickly track progress and working time",
    statsAria: "Analytics period",
    totalTask: "Total tasks",
    doneTask: "Completed tasks",
    doneRate: "Completion rate",
    totalHours: "Total hours",
    selectedDayTask: "Tasks on selected day",
    noSelectedDayTask: "No tasks for the selected day.",
    weeklyGoals: "Weekly goals",
    deadline: "Deadline",
    weekWarning: "Week is ending but goal is not completed yet.",
    noGoals: "No weekly goals yet.",
    reportFilter: "Report Filters",
    reportByDay: "By day",
    reportByMonth: "By month",
    pickDate: "Pick date",
    pickMonth: "Pick month",
    scopeDayHint: "Stats are filtered by the selected day.",
    scopeMonthHint: "Stats are filtered by the selected month.",
  },
};

function dateLocale(locale) {
  return locale === "en" ? "en-US" : "vi-VN";
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function parseISODate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isValidMonthValue(value) {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value);
}

function toMonthValue(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function getDaySeries(tasks, locale, anchorISODate) {
  const anchor = parseISODate(anchorISODate) || new Date();
  const labels = [];
  const values = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(anchor);
    date.setDate(anchor.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    const minutes = tasks
      .filter((task) => task.date === key)
      .reduce((sum, task) => sum + taskDurationMinutes(task), 0);

    labels.push(
      date.toLocaleDateString(dateLocale(locale), {
        day: "2-digit",
        month: "2-digit",
      })
    );
    values.push(Number((minutes / 60).toFixed(1)));
  }

  return { labels, values };
}

function getMonthSeries(tasks, monthValue) {
  const [yearText, monthText] = isValidMonthValue(monthValue)
    ? monthValue.split("-")
    : [String(new Date().getFullYear()), pad2(new Date().getMonth() + 1)];
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10) - 1;
  const dayCount = new Date(year, month + 1, 0).getDate();

  const labels = [];
  const values = [];

  for (let day = 1; day <= dayCount; day += 1) {
    const key = `${year}-${pad2(month + 1)}-${pad2(day)}`;
    const minutes = tasks
      .filter((task) => task.date === key)
      .reduce((sum, task) => sum + taskDurationMinutes(task), 0);

    labels.push(String(day));
    values.push(Number((minutes / 60).toFixed(1)));
  }

  return { labels, values };
}

function getYearSeries(tasks, year) {
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const values = labels.map((_, monthIndex) => {
    const minutes = tasks
      .filter((task) => {
        const date = new Date(task.date);
        return date.getFullYear() === year && date.getMonth() === monthIndex;
      })
      .reduce((sum, task) => sum + taskDurationMinutes(task), 0);

    return Number((minutes / 60).toFixed(1));
  });

  return { labels, values };
}

export default function DashboardPage() {
  const { loaded, darkMode, state, actions } = usePlannerData();
  const [locale] = useUiLocale();
  const [analyticsView, setAnalyticsView] = useState("day");
  const [reportScope, setReportScope] = useState("day");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedMonth, setSelectedMonth] = useState(() => toMonthValue(new Date()));
  const copy = COPY[locale] || COPY.vi;
  const tasks = state?.tasks || [];
  const goals = state?.goals || [];
  const today = state?.today || "";

  useEffect(() => {
    if (!today) return;
    if (!parseISODate(selectedDate)) {
      setSelectedDate(today);
    }
    if (!isValidMonthValue(selectedMonth)) {
      setSelectedMonth(today.slice(0, 7));
    }
  }, [today, selectedDate, selectedMonth]);

  const analyticsOptions = useMemo(
    () => [
      { value: "day", label: copy.options.day },
      { value: "month", label: copy.options.month },
      { value: "year", label: copy.options.year },
    ],
    [copy.options.day, copy.options.month, copy.options.year]
  );

  const selectedDayTasks = useMemo(
    () => tasks.filter((task) => task.date === selectedDate),
    [tasks, selectedDate]
  );
  const selectedMonthTasks = useMemo(
    () => tasks.filter((task) => task.date.startsWith(`${selectedMonth}-`)),
    [tasks, selectedMonth]
  );
  const scopedTasks = reportScope === "month" ? selectedMonthTasks : selectedDayTasks;
  const stats = getStats(scopedTasks);

  const selectedYear = Number.parseInt(selectedMonth.slice(0, 4), 10) || new Date().getFullYear();
  const daySeries = useMemo(() => getDaySeries(tasks, locale, selectedDate), [tasks, locale, selectedDate]);
  const monthSeries = useMemo(() => getMonthSeries(tasks, selectedMonth), [tasks, selectedMonth]);
  const yearSeries = useMemo(() => getYearSeries(tasks, selectedYear), [tasks, selectedYear]);

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
  const SelectedChart = currentChart.chartType === "line" ? LineChart : BarChart;

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

        <div className="dashboard-filter-row">
          <div className="dashboard-filter-head">
            <strong>{copy.reportFilter}</strong>
            <span className="muted">{reportScope === "month" ? copy.scopeMonthHint : copy.scopeDayHint}</span>
          </div>
          <div className="dashboard-scope-toggle" role="tablist" aria-label={copy.reportFilter}>
            <button
              type="button"
              role="tab"
              aria-selected={reportScope === "day"}
              className={`dashboard-scope-btn${reportScope === "day" ? " active" : ""}`}
              onClick={() => setReportScope("day")}
            >
              {copy.reportByDay}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={reportScope === "month"}
              className={`dashboard-scope-btn${reportScope === "month" ? " active" : ""}`}
              onClick={() => setReportScope("month")}
            >
              {copy.reportByMonth}
            </button>
          </div>
          <label className="dashboard-filter-field">
            <span>{copy.pickDate}</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => {
                const next = event.target.value;
                setSelectedDate(next);
                if (parseISODate(next)) {
                  setSelectedMonth(next.slice(0, 7));
                }
              }}
            />
          </label>
          <label className="dashboard-filter-field">
            <span>{copy.pickMonth}</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => {
                const next = event.target.value;
                setSelectedMonth(next);
                if (isValidMonthValue(next) && !selectedDate.startsWith(`${next}-`)) {
                  setSelectedDate(`${next}-01`);
                }
              }}
            />
          </label>
        </div>

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
            <h3>{copy.selectedDayTask}</h3>
          </div>
          <div className="list-cards">
            {selectedDayTasks.length ? (
              selectedDayTasks.map((task) => (
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
              <div className="mini-card">{copy.noSelectedDayTask}</div>
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
