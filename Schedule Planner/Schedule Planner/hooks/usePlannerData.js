"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getOrCreateAnonymousUserId } from "@/lib/anonymousUser";
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

function normalizeStateShape(input) {
  return {
    tasks: Array.isArray(input?.tasks) ? input.tasks : [],
    goals: Array.isArray(input?.goals) ? input.goals : [],
  };
}

function buildPlannerApiUrl(userId) {
  return `/api/planner?userId=${encodeURIComponent(userId)}`;
}

async function fetchServerState(userId) {
  const response = await fetch(buildPlannerApiUrl(userId), { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Khong the tai du lieu tu database.");
  }

  const payload = await response.json();
  return normalizeStateShape(payload);
}

async function saveServerState(userId, state) {
  const response = await fetch(buildPlannerApiUrl(userId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });

  if (!response.ok) {
    throw new Error("Khong the luu du lieu vao database.");
  }
}

export function usePlannerData() {
  const [state, setState] = useState({ tasks: [], goals: [] });
  const [loaded, setLoaded] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [userId, setUserId] = useState("");
  const syncErrorShown = useRef(false);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const resolvedUserId = getOrCreateAnonymousUserId();
      if (!resolvedUserId) {
        return;
      }

      const localState = loadState();
      let nextState = localState;

      try {
        const serverState = await fetchServerState(resolvedUserId);
        const hasServerData = serverState.tasks.length > 0 || serverState.goals.length > 0;

        if (hasServerData) {
          nextState = serverState;
        } else {
          await saveServerState(resolvedUserId, localState);
        }
      } catch {
        nextState = localState;
      }

      if (!active) return;
      setUserId(resolvedUserId);
      setState(nextState);
      saveState(nextState);

      const theme = localStorage.getItem(THEME_KEY) || "light";
      const dark = theme === "dark";
      setDarkMode(dark);
      document.body.classList.toggle("dark", dark);
      setLoaded(true);
    }

    bootstrap();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded || !userId) return;

    saveState(state);

    let active = true;
    async function persistToServer() {
      try {
        await saveServerState(userId, state);
        if (active) {
          syncErrorShown.current = false;
        }
      } catch (error) {
        if (active && !syncErrorShown.current) {
          console.error(error);
          syncErrorShown.current = true;
        }
      }
    }

    persistToServer();
    return () => {
      active = false;
    };
  }, [state, loaded, userId]);

  const actions = useMemo(
    () => ({
      addTask(payload) {
        const next = { ...state, tasks: [...state.tasks] };
        if (hasOverlap(next.tasks, payload)) {
          return { ok: false, message: "Task bi trung gio trong cung ngay." };
        }

        next.tasks.push({ id: crypto.randomUUID(), ...payload });
        setState(next);
        return { ok: true };
      },

      updateTask(id, payload) {
        const next = { ...state, tasks: [...state.tasks] };
        if (hasOverlap(next.tasks, payload, id)) {
          return { ok: false, message: "Task bi trung gio trong cung ngay." };
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
          return { ok: false, message: "Khong the keo vi bi trung gio." };
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
    userId,
    state: computed,
    actions,
  };
}

