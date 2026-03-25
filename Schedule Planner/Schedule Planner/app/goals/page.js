"use client";

import { useState } from "react";
import AppShell from "@/components/AppShell";
import { usePlannerData } from "@/hooks/usePlannerData";
import { daysRemaining, formatDate } from "@/lib/plannerStore";

export default function GoalsPage() {
  const { loaded, darkMode, state, actions } = usePlannerData();
  const [form, setForm] = useState({ title: "", target: 1, deadline: "" });

  if (!loaded) {
    return null;
  }

  function submitGoal(event) {
    event.preventDefault();
    if (!form.title.trim() || !form.deadline || Number(form.target) < 1) {
      return;
    }

    actions.addGoal({
      title: form.title.trim(),
      target: Number(form.target),
      deadline: form.deadline,
    });

    setForm({ title: "", target: 1, deadline: "" });
  }

  return (
    <AppShell
      title="Weekly Goals"
      subtitle="Track progress theo tuần"
      quote="Goals turn plans into measurable outcomes."
      goalProgress={state.goalOverall}
      themeLabel={darkMode ? "Light mode" : "Dark mode"}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel">
        <div className="panel-head">
          <h3>Tạo goal mới</h3>
          <p className="muted">Task hoàn thành sẽ tự cộng vào goal đã link</p>
        </div>

        <form className="grid-form" onSubmit={submitGoal}>
          <input
            type="text"
            placeholder="Tên mục tiêu"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            required
          />
          <input
            type="number"
            min="1"
            placeholder="Số lượng cần đạt"
            value={form.target}
            onChange={(event) => setForm({ ...form, target: event.target.value })}
            required
          />
          <input
            type="date"
            value={form.deadline}
            onChange={(event) => setForm({ ...form, deadline: event.target.value })}
            required
          />
          <button className="btn" type="submit">Thêm goal</button>
        </form>

        <div className="goal-list">
          {state.goals.length ? (
            state.goals.map((goal) => (
              <article className="goal-card" key={goal.id}>
                <div className="goal-row">
                  <strong>{goal.title}</strong>
                  <span>{goal.completed}/{goal.target}</span>
                </div>
                <div className="progress"><span style={{ width: `${goal.progress}%` }} /></div>
                <p className="muted">Deadline: {formatDate(goal.deadline)} · Tiến độ: {goal.progress}%</p>
                {daysRemaining(goal.deadline) <= 2 && goal.progress < 100 ? (
                  <p className="reminder">Nhắc nhở: gần hết tuần nhưng goal chưa đạt.</p>
                ) : null}
                <button className="btn-link" onClick={() => actions.deleteGoal(goal.id)}>Xóa goal</button>
              </article>
            ))
          ) : (
            <div className="mini-card">Chưa có goal nào.</div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
