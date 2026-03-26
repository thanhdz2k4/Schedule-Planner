const AUTH_SESSION_STORAGE_KEY = "schedule_planner_auth_session_v1";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeSession(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const token = typeof raw.token === "string" ? raw.token.trim() : "";
  const userId = typeof raw.userId === "string" ? raw.userId.trim() : "";
  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";

  if (!token || !UUID_REGEX.test(userId) || !email) {
    return null;
  }

  return { token, userId, email };
}

export function loadAuthSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return normalizeSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveAuthSession(session) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeSession(session);
  if (!normalized) {
    return;
  }

  localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(normalized));
}

export function clearAuthSession() {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}
