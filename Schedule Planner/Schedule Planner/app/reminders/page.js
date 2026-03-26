"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { usePlannerData } from "@/hooks/usePlannerData";
import { loadAuthSession } from "@/lib/authClient";
import { daysRemaining, formatDate, priorityLabel, statusLabel } from "@/lib/plannerStore";

export default function RemindersPage() {
  const { loaded, darkMode, state, actions } = usePlannerData();
  const [authSession, setAuthSession] = useState(null);
  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [dispatchMessage, setDispatchMessage] = useState("");
  const [dispatchError, setDispatchError] = useState("");

  useEffect(() => {
    setAuthSession(loadAuthSession());
  }, []);

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

      {dispatchError ? <p className="alert">{dispatchError}</p> : null}
      {!dispatchError && dispatchMessage ? <p className="integration-success">{dispatchMessage}</p> : null}
    </AppShell>
  );
}
