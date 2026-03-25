export const ANON_USER_ID_KEY = "schedule_planner_user_id_v1";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === "string" && UUID_REGEX.test(value.trim());
}

export function getOrCreateAnonymousUserId() {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = localStorage.getItem(ANON_USER_ID_KEY);
  if (isUuid(stored)) {
    return stored.trim();
  }

  const created = crypto.randomUUID();
  localStorage.setItem(ANON_USER_ID_KEY, created);
  return created;
}

export function rotateAnonymousUserId() {
  if (typeof window === "undefined") {
    return null;
  }

  const created = crypto.randomUUID();
  localStorage.setItem(ANON_USER_ID_KEY, created);
  return created;
}

export function formatShortUserId(userId) {
  if (!isUuid(userId)) {
    return "unknown";
  }

  return `${userId.slice(0, 8)}...${userId.slice(-4)}`;
}

