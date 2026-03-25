"use client";

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { usePlannerData } from "@/hooks/usePlannerData";
import { priorityLabel, statusLabel, toMinutes, todayISO } from "@/lib/plannerStore";

const HOUR_HEIGHT = 40;

export default function DailyPage() {
  const { loaded, darkMode, state, actions } = usePlannerData();
  const [alert, setAlert] = useState("");
  const [editingId, setEditingId] = useState("");
  const [drag, setDrag] = useState(null);
  const [form, setForm] = useState({
    date: todayISO(),
    title: "",
    start: "08:00",
    end: "09:00",
    status: "todo",
    priority: "medium",
    goalId: "",
  });

  const visibleTasks = useMemo(
    () =>
      state.tasks
        .filter((task) => task.date === form.date)
        .sort((a, b) => toMinutes(a.start) - toMinutes(b.start)),
    [state.tasks, form.date]
  );

  if (!loaded) return null;

  function submitTask(event) {
    event.preventDefault();
    if (!form.title.trim()) {
      setAlert("Vui lòng nhập tên task.");
      return;
    }

    if (toMinutes(form.end) <= toMinutes(form.start)) {
      setAlert("Giờ kết thúc phải lớn hơn giờ bắt đầu.");
      return;
    }

    const payload = { ...form, title: form.title.trim() };
    const result = editingId ? actions.updateTask(editingId, payload) : actions.addTask(payload);

    if (!result.ok) {
      setAlert(result.message);
      return;
    }

    setAlert("");
    setEditingId("");
    setForm({ ...payload, title: "", start: "08:00", end: "09:00", status: "todo", priority: "medium", goalId: "" });
  }

  function onEdit(task) {
    setEditingId(task.id);
    setForm({
      date: task.date,
      title: task.title,
      start: task.start,
      end: task.end,
      status: task.status,
      priority: task.priority,
      goalId: task.goalId || "",
    });
  }

  function resetEdit() {
    setEditingId("");
    setAlert("");
    setForm({ ...form, title: "", start: "08:00", end: "09:00", status: "todo", priority: "medium", goalId: "" });
  }

  function onDragStart(event, task) {
    setDrag({ taskId: task.id, startY: event.clientY });
  }

  function onDragMove(event) {
    if (!drag) return;
    const deltaY = event.clientY - drag.startY;
    const deltaMinutes = Math.round((deltaY / HOUR_HEIGHT) * 2) * 30;
    if (deltaMinutes === 0) return;

    const result = actions.moveTask(drag.taskId, deltaMinutes);
    if (!result.ok && result.message) {
      setAlert(result.message);
    } else {
      setAlert("");
      setDrag({ ...drag, startY: event.clientY });
    }
  }

  return (
    <AppShell
      title="Daily Timeline"
      subtitle="Không cho phép task overlap"
      goalProgress={state.goalOverall}
      quote="Plan the day before it starts."
      themeLabel={darkMode ? "Light mode" : "Dark mode"}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel">
        <div className="panel-head">
          <h3>Daily Planner</h3>
          <p className="muted">Add · Edit · Delete · Drag & Drop</p>
        </div>

        <form className="grid-form" onSubmit={submitTask}>
          <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
          <input type="text" placeholder="Tên task" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
          <input type="time" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} required />
          <input type="time" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} required />
          <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            <option value="todo">Chưa làm</option>
            <option value="doing">Đang làm</option>
            <option value="done">Hoàn thành</option>
          </select>
          <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
            <option value="high">Cao</option>
            <option value="medium">Trung bình</option>
            <option value="low">Thấp</option>
          </select>
          <select value={form.goalId} onChange={(event) => setForm({ ...form, goalId: event.target.value })}>
            <option value="">Không link goal</option>
            {state.goals.map((goal) => (
              <option value={goal.id} key={goal.id}>{goal.title}</option>
            ))}
          </select>
          <button className="btn" type="submit">{editingId ? "Cập nhật task" : "Thêm task"}</button>
        </form>

        {editingId ? <button className="btn-link" onClick={resetEdit}>Hủy sửa</button> : null}
        {alert ? <p className="alert">{alert}</p> : null}

        <div className="timeline-wrap" onPointerMove={onDragMove} onPointerUp={() => setDrag(null)}>
          <div className="timeline">
            {Array.from({ length: 24 }).map((_, hour) => (
              <div key={hour} className="hour-label" style={{ top: `${hour * HOUR_HEIGHT + 2}px` }}>
                {String(hour).padStart(2, "0")}:00
              </div>
            ))}

            {visibleTasks.map((task) => {
              const start = toMinutes(task.start);
              const end = toMinutes(task.end);
              const height = ((end - start) / 60) * HOUR_HEIGHT;
              const top = (start / 60) * HOUR_HEIGHT;

              return (
                <article
                  key={task.id}
                  className="task-card"
                  style={{ top, height }}
                  onPointerDown={(event) => onDragStart(event, task)}
                >
                  <header>
                    <strong>{task.title}</strong>
                    <span className="badge">{priorityLabel(task.priority)}</span>
                  </header>
                  <p>{task.start} - {task.end}</p>
                  <p>{statusLabel(task.status)}</p>
                  <div className="task-actions">
                    <label>
                      <input
                        type="checkbox"
                        checked={task.status === "done"}
                        onChange={(event) => actions.toggleTaskDone(task.id, event.target.checked)}
                      />
                      Done
                    </label>
                    <button className="btn-link" onClick={() => onEdit(task)}>Sửa</button>
                    <button className="btn-link" onClick={() => actions.deleteTask(task.id)}>Xóa</button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
