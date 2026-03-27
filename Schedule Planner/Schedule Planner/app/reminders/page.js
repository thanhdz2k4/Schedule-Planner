"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { usePlannerData } from "@/hooks/usePlannerData";
import { useUiLocale } from "@/hooks/useUiLocale";
import { loadAuthSession } from "@/lib/authClient";
import { daysRemaining, formatDate, priorityLabel, statusLabel } from "@/lib/plannerStore";

const COPY = {
  vi: {
    loadSettingsError: "Không thể tải cài đặt nhắc việc.",
    loadSettingsUnexpected: "Lỗi bất ngờ khi tải cài đặt nhắc việc.",
    loginBeforeSave: "Vui lòng đăng nhập trước khi cập nhật cài đặt nhắc việc.",
    invalidLeadTime: "Thời gian nhắc phải là số nguyên >= 0.",
    saveSettingsError: "Không thể lưu cài đặt nhắc việc.",
    saveSettingsUnexpected: "Lỗi bất ngờ khi lưu cài đặt nhắc việc.",
    savedSetting: "Đã lưu cài đặt nhắc việc. Áp dụng cho {count} job nhắc việc đang chờ.",
    loginBeforeDispatch: "Vui lòng đăng nhập trước khi chạy dispatch nhắc việc.",
    dispatchError: "Không thể dispatch nhắc việc lúc này.",
    dispatchUnexpected: "Lỗi bất ngờ khi dispatch nhắc việc.",
    dispatchDone: "Dispatch xong. quét={scanned}, gửi={sent}, thử lại={retried}, lỗi={failed}.",
    titleLead: "Thời Gian Nhắc Việc",
    subLead: "Thiết lập thời gian gửi nhắc việc trước khi task bắt đầu.",
    seconds: "Giây",
    minutes: "Phút",
    saveSetting: "Lưu cài đặt nhắc việc",
    saving: "Đang lưu...",
    currentLead: "Thời gian nhắc hiện tại",
    notSet: "Chưa thiết lập",
    upcomingTasks: "Task Sắp Đến Hạn",
    dispatchNow: "Dispatch Reminder Ngay",
    dispatching: "Đang dispatch...",
    statusWord: "Trạng thái",
    noWaitingTask: "Không có task đang chờ.",
    warningGoals: "Cảnh Báo Mục Tiêu",
    dayToDeadline: "Còn {days} ngày tới deadline ({date}).",
    noWarningGoal: "Không có goal cần cảnh báo.",
  },
  en: {
    loadSettingsError: "Cannot load reminder settings.",
    loadSettingsUnexpected: "Unexpected error while loading reminder settings.",
    loginBeforeSave: "Please login first before updating reminder settings.",
    invalidLeadTime: "Lead time must be an integer >= 0.",
    saveSettingsError: "Cannot save reminder settings.",
    saveSettingsUnexpected: "Unexpected error while saving reminder settings.",
    savedSetting: "Reminder setting saved. Applied to {count} pending reminder job(s).",
    loginBeforeDispatch: "Please login first before dispatching reminders.",
    dispatchError: "Cannot dispatch reminders right now.",
    dispatchUnexpected: "Unexpected error while dispatching reminders.",
    dispatchDone: "Dispatch done. scanned={scanned}, sent={sent}, retried={retried}, failed={failed}.",
    titleLead: "Reminder Lead Time",
    subLead: "Set how long before task start the reminder should be sent.",
    seconds: "Seconds",
    minutes: "Minutes",
    saveSetting: "Save Reminder Setting",
    saving: "Saving...",
    currentLead: "Current effective lead time",
    notSet: "Not set yet",
    upcomingTasks: "Upcoming Tasks",
    dispatchNow: "Dispatch Reminder Now",
    dispatching: "Dispatching...",
    statusWord: "Status",
    noWaitingTask: "No pending tasks.",
    warningGoals: "Goal Alerts",
    dayToDeadline: "{days} day(s) left until deadline ({date}).",
    noWarningGoal: "No goals in warning state.",
  },
};

function withVars(template, vars = {}) {
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replace(new RegExp(`\\{${key}\\}`, "g"), String(value)),
    template
  );
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function normalizeLeadValue(value, fallback = "") {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }
  return String(parsed);
}

function formatLeadPreview(seconds, locale = "vi") {
  if (!Number.isInteger(seconds) || seconds < 0) {
    return "";
  }

  if (seconds === 0) {
    return locale === "en" ? "0 seconds" : "0 giây";
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  if (minutes > 0 && remainder > 0) {
    return locale === "en"
      ? `${minutes} minute(s) ${remainder} second(s)`
      : `${minutes} phút ${remainder} giây`;
  }
  if (minutes > 0) {
    return locale === "en" ? `${minutes} minute(s)` : `${minutes} phút`;
  }
  return locale === "en" ? `${remainder} second(s)` : `${remainder} giây`;
}

export default function RemindersPage() {
  const { loaded, darkMode, state, actions } = usePlannerData();
  const [locale] = useUiLocale();
  const copy = COPY[locale] || COPY.vi;
  const [authSession, setAuthSession] = useState(null);
  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [dispatchMessage, setDispatchMessage] = useState("");
  const [dispatchError, setDispatchError] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [leadUnit, setLeadUnit] = useState("minutes");
  const [leadValue, setLeadValue] = useState("5");
  const [effectiveLeadSeconds, setEffectiveLeadSeconds] = useState(300);

  useEffect(() => {
    const session = loadAuthSession();
    setAuthSession(session);

    if (!session?.token) {
      return;
    }

    let cancelled = false;
    async function loadReminderSettings() {
      setSettingsLoading(true);
      setSettingsError("");
      setSettingsMessage("");

      try {
        const response = await fetch("/api/reminders/settings", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
        });

        const payload = await safeJson(response);
        if (!response.ok) {
          if (!cancelled) {
            setSettingsError(payload?.message || copy.loadSettingsError);
          }
          return;
        }

        const setting = payload?.setting || {};
        const unit = setting?.display?.unit === "seconds" ? "seconds" : "minutes";
        const value = normalizeLeadValue(setting?.display?.value, unit === "seconds" ? "300" : "5");
        const leadSeconds = Number.parseInt(setting?.leadSeconds, 10);

        if (!cancelled) {
          setLeadUnit(unit);
          setLeadValue(value);
          setEffectiveLeadSeconds(Number.isInteger(leadSeconds) && leadSeconds >= 0 ? leadSeconds : 300);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setSettingsError(copy.loadSettingsUnexpected);
        }
      } finally {
        if (!cancelled) {
          setSettingsLoading(false);
        }
      }
    }

    loadReminderSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSaveReminderSetting() {
    if (!authSession?.token) {
      setSettingsError(copy.loginBeforeSave);
      setSettingsMessage("");
      return;
    }

    const parsed = Number.parseInt(leadValue, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      setSettingsError(copy.invalidLeadTime);
      setSettingsMessage("");
      return;
    }

    setSettingsSaving(true);
    setSettingsError("");
    setSettingsMessage("");

    try {
      const response = await fetch("/api/reminders/settings", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${authSession.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          value: parsed,
          unit: leadUnit,
        }),
      });

      const payload = await safeJson(response);
      if (!response.ok) {
        setSettingsError(payload?.message || copy.saveSettingsError);
        return;
      }

      const leadSeconds = Number.parseInt(payload?.setting?.leadSeconds, 10);
      const nextLeadSeconds = Number.isInteger(leadSeconds) && leadSeconds >= 0 ? leadSeconds : 300;

      const display = payload?.setting?.display || {};
      const nextUnit = display?.unit === "seconds" ? "seconds" : "minutes";
      const nextValue = normalizeLeadValue(display?.value, nextUnit === "seconds" ? "300" : "5");

      setLeadUnit(nextUnit);
      setLeadValue(nextValue);
      setEffectiveLeadSeconds(nextLeadSeconds);
      setSettingsMessage(withVars(copy.savedSetting, { count: payload?.jobsRebuilt || 0 }));
    } catch (error) {
      console.error(error);
      setSettingsError(copy.saveSettingsUnexpected);
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleDispatchNow() {
    if (!authSession?.token) {
      setDispatchError(copy.loginBeforeDispatch);
      setDispatchMessage("");
      return;
    }

    setDispatchBusy(true);
    setDispatchError("");
    setDispatchMessage("");

    try {
      const response = await fetch("/api/reminders/dispatch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authSession.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 20 }),
      });

      let payload = {};
      try {
        payload = await response.json();
      } catch {
        payload = {};
      }

      if (!response.ok) {
        setDispatchError(payload?.message || copy.dispatchError);
        return;
      }

      const summary = payload?.summary || {};
      setDispatchMessage(
        withVars(copy.dispatchDone, {
          scanned: summary.scanned || 0,
          sent: summary.sent || 0,
          retried: summary.retried || 0,
          failed: summary.failed || 0,
        })
      );
    } catch (error) {
      console.error(error);
      setDispatchError(copy.dispatchUnexpected);
    } finally {
      setDispatchBusy(false);
    }
  }

  if (!loaded) return null;

  const upcomingTasks = state.tasks
    .filter((task) => task.status !== "done")
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))
    .slice(0, 12);

  const warningGoals = state.goals.filter((goal) => daysRemaining(goal.deadline) <= 2 && goal.progress < 100);

  return (
    <AppShell
      title={{ vi: "Nhắc Việc", en: "Reminders" }}
      subtitle={{ vi: "Những task và mục tiêu cần ưu tiên ngay", en: "Tasks and goals that need immediate attention" }}
      quote={{ vi: "Nhắc việc giúp giữ ý định hành động.", en: "Reminders keep intentions alive." }}
      goalProgress={state.goalOverall}
      themeLabel={darkMode ? { vi: "Chế độ sáng", en: "Light mode" } : { vi: "Chế độ tối", en: "Dark mode" }}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel">
        <div className="panel-head">
          <h3>{copy.titleLead}</h3>
        </div>
        <div className="mini-card">
          <p className="muted">{copy.subLead}</p>
          <div className="grid-form">
            <input
              type="number"
              min="0"
              step="1"
              value={leadValue}
              onChange={(event) => setLeadValue(event.target.value)}
              placeholder={leadUnit === "seconds" ? copy.seconds : copy.minutes}
              disabled={settingsLoading || settingsSaving}
            />
            <select
              value={leadUnit}
              onChange={(event) => setLeadUnit(event.target.value === "seconds" ? "seconds" : "minutes")}
              disabled={settingsLoading || settingsSaving}
            >
              <option value="minutes">{copy.minutes}</option>
              <option value="seconds">{copy.seconds}</option>
            </select>
            <button
              type="button"
              className="btn"
              onClick={handleSaveReminderSetting}
              disabled={settingsLoading || settingsSaving}
            >
              {settingsSaving ? copy.saving : copy.saveSetting}
            </button>
          </div>
          <p className="muted">
            {copy.currentLead}: {formatLeadPreview(effectiveLeadSeconds, locale) || copy.notSet}.
          </p>
        </div>
      </section>

      <section className="panel two-col">
        <article>
          <div className="panel-head">
            <h3>{copy.upcomingTasks}</h3>
            <button type="button" className="btn" onClick={handleDispatchNow} disabled={dispatchBusy}>
              {dispatchBusy ? copy.dispatching : copy.dispatchNow}
            </button>
          </div>
          <div className="reminder-list">
            {upcomingTasks.length ? (
              upcomingTasks.map((task) => (
                <div className={`mini-card task-item priority-${task.priority}`} key={task.id}>
                  <strong>{task.title}</strong>
                  <div>
                    {formatDate(task.date, locale)} · {task.start} - {task.end}
                  </div>
                  <div className="muted">
                    {copy.statusWord}: {statusLabel(task.status, locale)}
                    <span className={`badge task-priority-pill priority-${task.priority}`}>
                      {priorityLabel(task.priority, locale)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="mini-card">{copy.noWaitingTask}</div>
            )}
          </div>
        </article>

        <article>
          <div className="panel-head">
            <h3>{copy.warningGoals}</h3>
          </div>
          <div className="reminder-list">
            {warningGoals.length ? (
              warningGoals.map((goal) => (
                <div className="goal-card" key={goal.id}>
                  <strong>{goal.title}</strong>
                  <div>
                    {goal.completed}/{goal.target} · {goal.progress}%
                  </div>
                  <p className="reminder">
                    {withVars(copy.dayToDeadline, {
                      days: daysRemaining(goal.deadline),
                      date: formatDate(goal.deadline, locale),
                    })}
                  </p>
                </div>
              ))
            ) : (
              <div className="mini-card">{copy.noWarningGoal}</div>
            )}
          </div>
        </article>
      </section>

      {settingsError ? <p className="alert">{settingsError}</p> : null}
      {!settingsError && settingsMessage ? <p className="integration-success">{settingsMessage}</p> : null}
      {dispatchError ? <p className="alert">{dispatchError}</p> : null}
      {!dispatchError && dispatchMessage ? <p className="integration-success">{dispatchMessage}</p> : null}
    </AppShell>
  );
}
