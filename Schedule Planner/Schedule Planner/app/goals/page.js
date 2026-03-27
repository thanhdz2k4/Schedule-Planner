"use client";

import { useState } from "react";
import AppShell from "@/components/AppShell";
import { usePlannerData } from "@/hooks/usePlannerData";
import { useUiLocale } from "@/hooks/useUiLocale";
import { daysRemaining, formatDate } from "@/lib/plannerStore";

const COPY = {
  vi: {
    createTitle: "Tạo Mục Tiêu Mới",
    createSub: "Task hoàn thành sẽ tự cộng vào mục tiêu đã liên kết",
    goalName: "Tên mục tiêu",
    goalTarget: "Số lượng cần đạt",
    addGoal: "Thêm mục tiêu",
    deadline: "Hạn chót",
    progress: "Tiến độ",
    warning: "Nhắc nhở: gần hết tuần nhưng mục tiêu chưa đạt.",
    delete: "Xóa mục tiêu",
    empty: "Chưa có mục tiêu nào.",
  },
  en: {
    createTitle: "Create New Goal",
    createSub: "Completed tasks will automatically count toward linked goals",
    goalName: "Goal title",
    goalTarget: "Target amount",
    addGoal: "Add goal",
    deadline: "Deadline",
    progress: "Progress",
    warning: "Reminder: week is ending but this goal is not completed.",
    delete: "Delete goal",
    empty: "No goals yet.",
  },
};

export default function GoalsPage() {
  const { loaded, darkMode, state, actions } = usePlannerData();
  const [locale] = useUiLocale();
  const [form, setForm] = useState({ title: "", target: 1, deadline: "" });
  const copy = COPY[locale] || COPY.vi;

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
      title={{ vi: "Mục Tiêu Tuần", en: "Weekly Goals" }}
      subtitle={{ vi: "Theo dõi tiến độ và mức độ hoàn thành", en: "Track progress and completion level" }}
      quote={{ vi: "Mục tiêu biến kế hoạch thành kết quả đo lường được.", en: "Goals turn plans into measurable outcomes." }}
      goalProgress={state.goalOverall}
      themeLabel={darkMode ? { vi: "Chế độ sáng", en: "Light mode" } : { vi: "Chế độ tối", en: "Dark mode" }}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel">
        <div className="panel-head">
          <h3>{copy.createTitle}</h3>
          <p className="muted">{copy.createSub}</p>
        </div>

        <form className="grid-form" onSubmit={submitGoal}>
          <input
            type="text"
            placeholder={copy.goalName}
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            required
          />
          <input
            type="number"
            min="1"
            placeholder={copy.goalTarget}
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
          <button className="btn" type="submit">
            {copy.addGoal}
          </button>
        </form>

        <div className="goal-list">
          {state.goals.length ? (
            state.goals.map((goal) => (
              <article className="goal-card" key={goal.id}>
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
                  {copy.deadline}: {formatDate(goal.deadline, locale)} · {copy.progress}: {goal.progress}%
                </p>
                {daysRemaining(goal.deadline) <= 2 && goal.progress < 100 ? (
                  <p className="reminder">{copy.warning}</p>
                ) : null}
                <button className="btn-link" type="button" onClick={() => actions.deleteGoal(goal.id)}>
                  {copy.delete}
                </button>
              </article>
            ))
          ) : (
            <div className="mini-card">{copy.empty}</div>
          )}
        </div>
      </section>
    </AppShell>
  );
}

