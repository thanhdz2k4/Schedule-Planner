"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { usePlannerData } from "@/hooks/usePlannerData";

export default function FocusPage() {
  const { loaded, darkMode, state, actions } = usePlannerData();
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          clearInterval(timer);
          setRunning(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [running]);

  if (!loaded) return null;

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  return (
    <AppShell
      title="Focus Mode"
      subtitle="Pomodoro timer để duy trì kỷ luật"
      quote="One focused block at a time."
      goalProgress={state.goalOverall}
      themeLabel={darkMode ? "Light mode" : "Dark mode"}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel">
        <div className="panel-head">
          <h3>Pomodoro</h3>
          <p className="muted">Chu kỳ 25 phút</p>
        </div>

        <div className="focus-timer">
          <div className="timer-circle">
            <h2>{minutes}:{seconds}</h2>
          </div>
          <div>
            <button className="btn" onClick={() => setRunning((prev) => !prev)}>{running ? "Pause" : "Start"}</button>
            <button className="btn ghost" onClick={() => { setRunning(false); setSecondsLeft(25 * 60); }}>Reset</button>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
