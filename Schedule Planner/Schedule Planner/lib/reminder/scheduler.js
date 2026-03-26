export const DEFAULT_INTEGRATION_ID = "gmail";
export const DEFAULT_REMINDER_LEAD_MINUTES = 5;

export function normalizeLeadMinutes(value, fallback = DEFAULT_REMINDER_LEAD_MINUTES) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}
