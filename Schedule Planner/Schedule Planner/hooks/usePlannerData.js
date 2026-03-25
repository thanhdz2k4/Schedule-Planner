"use client";

import { useEffect, useMemo, useState } from "react";
import {
  THEME_KEY,
  hasOverlap,
  loadState,
  saveState,
  taskDurationMinutes,
  toHHMM,
  toMinutes,
  todayISO,
} from "@/lib/plannerStore";

export function usePlannerData() {
  const [state, setState] = useState({ tasks: [], goals: [] });
  const [loaded, setLoaded] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const nextState = loadState();
    setState(nextState);

    const theme = localStorage.getItem(THEME_KEY) || "light";
    const dark = theme === "dark";
    setDarkMode(dark);
    document.body.classList.toggle("dark", dark);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveState(state);
  }, [state, loaded]);

  const actions = useMemo(
    () => ({
      addTask(payload) {
        const next = { ...state, tasks: [...state.tasks] };
        if (hasOverlap(next.tasks, payload)) {
          return { ok: false, message: "Task bị trùng giờ trong cùng ngày." };
        }

        next.tasks.push({ id: crypto.randomUUID(), ...payload });
        setState(next);
        return { ok: true };
      },

      updateTask(id, payload) {
        const next = { ...state, tasks: [...state.tasks] };
        if (hasOverlap(next.tasks, payload, id)) {
          return { ok: false, message: "Task bị trùng giờ trong cùng ngày." };
        }

        next.tasks = next.tasks.map((task) => (task.id === id ? { ...task, ...payload } : task));
        setState(next);
        return { ok: true };
      },

      deleteTask(id) {
        setState((prev) => ({ ...prev, tasks: prev.tasks.filter((task) => task.id !== id) }));
      },

      toggleTaskDone(id, checked) {
        setState((prev) => ({
          ...prev,
          tasks: prev.tasks.map((task) =>
            task.id === id ? { ...task, status: checked ? "done" : "todo" } : task
          ),
        }));
      },

      moveTask(id, deltaMinutes) {
        const original = state.tasks.find((task) => task.id === id);
        if (!original) return { ok: false };

        const duration = taskDurationMinutes(original);
        let nextStart = toMinutes(original.start) + deltaMinutes;
        nextStart = Math.max(0, Math.min(1440 - duration, nextStart));

        const payload = {
          ...original,
          start: toHHMM(nextStart),
          end: toHHMM(nextStart + duration),
        };

        if (hasOverlap(state.tasks, payload, id)) {
          return { ok: false, message: "Không thể kéo vì bị trùng giờ." };
        }

        return this.updateTask(id, payload);
      },

      addGoal(payload) {
        setState((prev) => ({
          ...prev,
          goals: [...prev.goals, { id: crypto.randomUUID(), completed: 0, ...payload }],
        }));
      },

      deleteGoal(id) {
        setState((prev) => ({
          tasks: prev.tasks.map((task) => (task.goalId === id ? { ...task, goalId: "" } : task)),
          goals: prev.goals.filter((goal) => goal.id !== id),
        }));
      },

      toggleTheme() {
        const next = !darkMode;
        setDarkMode(next);
        document.body.classList.toggle("dark", next);
        localStorage.setItem(THEME_KEY, next ? "dark" : "light");
      },
    }),
    [state, darkMode]
  );

  const computed = useMemo(() => {
    const tasks = state.tasks;
    const goals = state.goals.map((goal) => {
      const completed = tasks.filter((task) => task.goalId === goal.id && task.status === "done").length;
      const progress = goal.target ? Math.min(100, Math.round((completed / goal.target) * 100)) : 0;
      return { ...goal, completed, progress };
    });

    const totalTarget = goals.reduce((sum, goal) => sum + goal.target, 0);
    const totalCompleted = goals.reduce((sum, goal) => sum + goal.completed, 0);

    return {
      today: todayISO(),
      tasks,
      goals,
      goalOverall: totalTarget ? Math.round((totalCompleted / totalTarget) * 100) : 0,
    };
  }, [state]);

  return {
    loaded,
    darkMode,
    state: computed,
    actions,
  };
}
