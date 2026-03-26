"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getOrCreateAnonymousUserId } from "@/lib/anonymousUser";
import { clearAuthSession, loadAuthSession } from "@/lib/authClient";
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

const ACCOUNT_SYNC_INTERVAL_MS = 15000;

function normalizeStateShape(input) {
  return {
    tasks: Array.isArray(input?.tasks) ? input.tasks : [],
    goals: Array.isArray(input?.goals) ? input.goals : [],
  };
}

function serializeState(input) {
  return JSON.stringify(normalizeStateShape(input));
}

function areStatesEqual(a, b) {
  return serializeState(a) === serializeState(b);
}

function buildPlannerApiUrl(userId) {
  return `/api/planner?userId=${encodeURIComponent(userId)}`;
}

function createUnauthorizedError() {
  const error = new Error("Unauthorized");
  error.code = "UNAUTHORIZED";
  return error;
}

function buildAuthHeaders(authToken = "", contentType = "") {
  const headers = {};

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  return headers;
}

async function fetchServerState(userId, authToken = "") {
  const response = await fetch(buildPlannerApiUrl(userId), {
    cache: "no-store",
    headers: buildAuthHeaders(authToken),
  });

  if (response.status === 401) {
    throw createUnauthorizedError();
  }

  if (!response.ok) {
    throw new Error("Cannot load planner data from database.");
  }

  const payload = await response.json();
  return normalizeStateShape(payload);
}

async function saveServerState(userId, state, authToken = "") {
  const response = await fetch(buildPlannerApiUrl(userId), {
    method: "PUT",
    headers: buildAuthHeaders(authToken, "application/json"),
    body: JSON.stringify(state),
  });

  if (response.status === 401) {
    throw createUnauthorizedError();
  }

  if (!response.ok) {
    throw new Error("Cannot save planner data to database.");
  }
}

export function usePlannerData() {
  const [state, setState] = useState({ tasks: [], goals: [] });
  const [loaded, setLoaded] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [userId, setUserId] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [allowPersist, setAllowPersist] = useState(false);
  const syncErrorShown = useRef(false);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const anonymousUserId = getOrCreateAnonymousUserId();
      if (!anonymousUserId) {
        return;
      }

      const localState = loadState();
      let nextState = localState;
      const session = loadAuthSession();
      let resolvedUserId = session?.userId || anonymousUserId;
      let resolvedAuthToken = session?.token || "";
      let shouldPersist = true;

      // Logged-in users should follow server as source of truth.
      if (session?.token && session?.userId) {
        try {
          nextState = await fetchServerState(resolvedUserId, resolvedAuthToken);
        } catch (error) {
          if (error?.code === "UNAUTHORIZED") {
            clearAuthSession();
            resolvedUserId = anonymousUserId;
            resolvedAuthToken = "";

            try {
              const anonymousServerState = await fetchServerState(resolvedUserId);
              const hasAnonymousServerData =
                anonymousServerState.tasks.length > 0 || anonymousServerState.goals.length > 0;

              if (hasAnonymousServerData) {
                nextState = anonymousServerState;
              } else {
                await saveServerState(resolvedUserId, localState);
                nextState = localState;
              }
            } catch {
              nextState = localState;
            }
          } else {
            // Keep local data for UX, but do not overwrite account data until fetch succeeds.
            nextState = localState;
            shouldPersist = false;
          }
        }
      } else {
        try {
          const serverState = await fetchServerState(resolvedUserId);
          const hasServerData = serverState.tasks.length > 0 || serverState.goals.length > 0;

          if (hasServerData) {
            nextState = serverState;
          } else {
            await saveServerState(resolvedUserId, localState);
            nextState = localState;
          }
        } catch {
          nextState = localState;
        }
      }

      if (!active) return;
      setUserId(resolvedUserId);
      setAuthToken(resolvedAuthToken);
      setAllowPersist(shouldPersist);
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
    if (!loaded || !userId || !allowPersist) return;

    saveState(state);

    let active = true;
    async function persistToServer() {
      try {
        await saveServerState(userId, state, authToken);
        if (active) {
          syncErrorShown.current = false;
        }
      } catch (error) {
        if (active && error?.code === "UNAUTHORIZED") {
          clearAuthSession();
          window.location.reload();
          return;
        }

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
  }, [state, loaded, userId, authToken, allowPersist]);

  useEffect(() => {
    if (!loaded || !userId || !authToken) return;

    let active = true;
    let syncInFlight = false;

    async function pullLatestFromServer() {
      if (syncInFlight) {
        return;
      }

      syncInFlight = true;
      try {
        const serverState = await fetchServerState(userId, authToken);
        if (!active) {
          return;
        }

        setAllowPersist(true);
        setState((prev) => (areStatesEqual(prev, serverState) ? prev : serverState));
      } catch (error) {
        if (!active) {
          return;
        }

        if (error?.code === "UNAUTHORIZED") {
          clearAuthSession();
          window.location.reload();
        }
      } finally {
        syncInFlight = false;
      }
    }

    pullLatestFromServer();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        pullLatestFromServer();
      }
    }, ACCOUNT_SYNC_INTERVAL_MS);

    const onFocus = () => {
      pullLatestFromServer();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        pullLatestFromServer();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loaded, userId, authToken]);

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
