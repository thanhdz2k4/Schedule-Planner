export const DEFAULT_INTEGRATION_ID = "gmail";
export const DEFAULT_REMINDER_LEAD_SECONDS = 300;
export const DEFAULT_REMINDER_LEAD_MINUTES = Math.floor(DEFAULT_REMINDER_LEAD_SECONDS / 60);
export const MAX_REMINDER_LEAD_SECONDS = 86400;

export function normalizeLeadMinutes(value, fallback = DEFAULT_REMINDER_LEAD_MINUTES) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

export function normalizeLeadSeconds(value, fallback = DEFAULT_REMINDER_LEAD_SECONDS) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.min(parsed, MAX_REMINDER_LEAD_SECONDS);
}
