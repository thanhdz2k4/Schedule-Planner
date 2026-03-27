"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { usePlannerData } from "@/hooks/usePlannerData";
import { useUiLocale } from "@/hooks/useUiLocale";

const COPY = {
  vi: {
    timerSub: "Chu kỳ 25 phút",
    pause: "Tạm dừng",
    start: "Bắt đầu",
    reset: "Đặt lại",
  },
  en: {
    timerSub: "25-minute cycle",
    pause: "Pause",
    start: "Start",
    reset: "Reset",
  },
};

export default function FocusPage() {
  const { loaded, darkMode, state, actions } = usePlannerData();
  const [locale] = useUiLocale();
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const copy = COPY[locale] || COPY.vi;

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
      title={{ vi: "Chế Độ Tập Trung", en: "Focus Mode" }}
      subtitle={{ vi: "Pomodoro 25 phút để giữ nhịp làm việc", en: "25-minute Pomodoro to stay in rhythm" }}
      quote={{ vi: "Tập trung từng block một.", en: "One focused block at a time." }}
      goalProgress={state.goalOverall}
      themeLabel={darkMode ? { vi: "Chế độ sáng", en: "Light mode" } : { vi: "Chế độ tối", en: "Dark mode" }}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel">
        <div className="panel-head">
          <h3>Pomodoro Timer</h3>
          <p className="muted">{copy.timerSub}</p>
        </div>

        <div className="focus-timer">
          <div className="timer-circle">
            <h2>
              {minutes}:{seconds}
            </h2>
          </div>
          <div>
            <button className="btn" type="button" onClick={() => setRunning((prev) => !prev)}>
              {running ? copy.pause : copy.start}
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setRunning(false);
                setSecondsLeft(25 * 60);
              }}
            >
              {copy.reset}
            </button>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

