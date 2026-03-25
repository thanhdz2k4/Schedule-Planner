"use client";

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { usePlannerData } from "@/hooks/usePlannerData";
import { priorityLabel, statusLabel, toMinutes, todayISO } from "@/lib/plannerStore";

const HOUR_HEIGHT = 36;

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
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button, input, label")) {
      return;
    }
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
      title="Timeline Ngày"
      subtitle="Sắp lịch theo giờ, không cho phép trùng task"
      goalProgress={state.goalOverall}
      quote="Plan the day before it starts."
      themeLabel={darkMode ? "Chế độ sáng" : "Chế độ tối"}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel">
        <div className="panel-head">
          <h3>Lịch Làm Việc Theo Ngày</h3>
          <p className="muted">Thêm · Sửa · Xóa · Kéo thả đổi thời gian</p>
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
            <option value="">Không gắn mục tiêu</option>
            {state.goals.map((goal) => (
              <option value={goal.id} key={goal.id}>{goal.title}</option>
            ))}
          </select>
          <button className="btn" type="submit">{editingId ? "Cập nhật task" : "Thêm task"}</button>
        </form>

        {editingId ? <button className="btn-link" type="button" onClick={resetEdit}>Hủy sửa</button> : null}
        {alert ? <p className="alert">{alert}</p> : null}
        <p className="muted" style={{ marginTop: 8 }}>
          Task quá ngắn sẽ hiển thị tối giản để không vỡ layout. Double-click vào task để mở sửa nhanh.
        </p>

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
              const isTiny = height < 72;
              const isCompact = height < 108;
              const showStatus = !isCompact;

              return (
                <article
                  key={task.id}
                  className={`task-card priority-${task.priority}${isCompact ? " compact" : ""}${isTiny ? " tiny" : ""}`}
                  style={{ top, height }}
                  onPointerDown={(event) => onDragStart(event, task)}
                  onDoubleClick={() => onEdit(task)}
                >
                  <header className="task-head">
                    <strong title={task.title}>{task.title}</strong>
                    {isTiny ? null : (
                      <span className={`badge task-priority-badge priority-${task.priority}`}>
                        {priorityLabel(task.priority)}
                      </span>
                    )}
                  </header>

                  <div className={`task-meta-row${isTiny ? " task-meta-row-tiny" : ""}`}>
                    <span className="task-time">{task.start} - {task.end}</span>
                    {showStatus ? <span className="badge task-status-badge">{statusLabel(task.status)}</span> : null}
                    {isTiny ? (
                      <div className="task-action-buttons">
                        <button className="task-action-btn" type="button" onClick={() => onEdit(task)}>
                          Sửa
                        </button>
                        <button
                          className="task-action-btn danger"
                          type="button"
                          onClick={() => actions.deleteTask(task.id)}
                        >
                          Xóa
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {!isTiny ? (
                    <div className="task-actions">
                      <label className="task-check">
                        <input
                          type="checkbox"
                          checked={task.status === "done"}
                          onChange={(event) => actions.toggleTaskDone(task.id, event.target.checked)}
                        />
                        {isCompact ? null : <span>Hoàn thành</span>}
                      </label>
                      <div className="task-action-buttons">
                        <button className="task-action-btn" type="button" onClick={() => onEdit(task)}>
                          Sửa
                        </button>
                        <button
                          className="task-action-btn danger"
                          type="button"
                          onClick={() => actions.deleteTask(task.id)}
                        >
                          Xóa
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </AppShell>
  );
}

