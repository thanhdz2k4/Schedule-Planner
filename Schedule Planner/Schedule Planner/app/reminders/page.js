"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { usePlannerData } from "@/hooks/usePlannerData";
import { loadAuthSession } from "@/lib/authClient";
import { daysRemaining, formatDate, priorityLabel, statusLabel } from "@/lib/plannerStore";

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

function formatLeadPreview(seconds) {
  if (!Number.isInteger(seconds) || seconds < 0) {
    return "";
  }

  if (seconds === 0) {
    return "0 seconds";
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  if (minutes > 0 && remainder > 0) {
    return `${minutes} minute(s) ${remainder} second(s)`;
  }
  if (minutes > 0) {
    return `${minutes} minute(s)`;
  }
  return `${remainder} second(s)`;
}

export default function RemindersPage() {
  const { loaded, darkMode, state, actions } = usePlannerData();
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
            setSettingsError(payload?.message || "Cannot load reminder settings.");
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
          setSettingsError("Unexpected error while loading reminder settings.");
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
      setSettingsError("Please login first before updating reminder settings.");
      setSettingsMessage("");
      return;
    }

    const parsed = Number.parseInt(leadValue, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      setSettingsError("Lead time must be an integer >= 0.");
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
        setSettingsError(payload?.message || "Cannot save reminder settings.");
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
      setSettingsMessage(
        `Reminder setting saved. Applied to ${payload?.jobsRebuilt || 0} pending reminder job(s).`
      );
    } catch (error) {
      console.error(error);
      setSettingsError("Unexpected error while saving reminder settings.");
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleDispatchNow() {
    if (!authSession?.token) {
      setDispatchError("Please login first before dispatching reminders.");
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
        setDispatchError(payload?.message || "Cannot dispatch reminders right now.");
        return;
      }

      const summary = payload?.summary || {};
      setDispatchMessage(
        `Dispatch done. scanned=${summary.scanned || 0}, sent=${summary.sent || 0}, retried=${summary.retried || 0}, failed=${summary.failed || 0}.`
      );
    } catch (error) {
      console.error(error);
      setDispatchError("Unexpected error while dispatching reminders.");
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
      title="Nhac Viec"
      subtitle="Nhung task va muc tieu can uu tien ngay"
      quote="Reminders keep intentions alive."
      goalProgress={state.goalOverall}
      themeLabel={darkMode ? "Che do sang" : "Che do toi"}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel">
        <div className="panel-head">
          <h3>Reminder Lead Time</h3>
        </div>
        <div className="mini-card">
          <p className="muted">Set how long before task start the reminder should be sent.</p>
          <div className="grid-form">
            <input
              type="number"
              min="0"
              step="1"
              value={leadValue}
              onChange={(event) => setLeadValue(event.target.value)}
              placeholder={leadUnit === "seconds" ? "Seconds" : "Minutes"}
              disabled={settingsLoading || settingsSaving}
            />
            <select
              value={leadUnit}
              onChange={(event) => setLeadUnit(event.target.value === "seconds" ? "seconds" : "minutes")}
              disabled={settingsLoading || settingsSaving}
            >
              <option value="minutes">Minutes</option>
              <option value="seconds">Seconds</option>
            </select>
            <button
              type="button"
              className="btn"
              onClick={handleSaveReminderSetting}
              disabled={settingsLoading || settingsSaving}
            >
              {settingsSaving ? "Saving..." : "Save Reminder Setting"}
            </button>
          </div>
          <p className="muted">
            Current effective lead time: {formatLeadPreview(effectiveLeadSeconds) || "Not set yet"}.
          </p>
        </div>
      </section>

      <section className="panel two-col">
        <article>
          <div className="panel-head">
            <h3>Task Sap Den Han</h3>
            <button type="button" className="btn" onClick={handleDispatchNow} disabled={dispatchBusy}>
              {dispatchBusy ? "Dispatching..." : "Dispatch Reminder Now"}
            </button>
          </div>
          <div className="reminder-list">
            {upcomingTasks.length ? (
              upcomingTasks.map((task) => (
                <div className={`mini-card task-item priority-${task.priority}`} key={task.id}>
                  <strong>{task.title}</strong>
                  <div>
                    {formatDate(task.date)} · {task.start} - {task.end}
                  </div>
                  <div className="muted">
                    Trang thai: {statusLabel(task.status)}
                    <span className={`badge task-priority-pill priority-${task.priority}`}>
                      {priorityLabel(task.priority)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="mini-card">Khong co task dang cho.</div>
            )}
          </div>
        </article>

        <article>
          <div className="panel-head">
            <h3>Canh Bao Muc Tieu</h3>
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
                    Con {daysRemaining(goal.deadline)} ngay toi deadline ({formatDate(goal.deadline)}).
                  </p>
                </div>
              ))
            ) : (
              <div className="mini-card">Khong co goal canh bao.</div>
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
