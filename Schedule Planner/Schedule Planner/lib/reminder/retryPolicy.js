const RETRY_DELAYS_SECONDS = [30, 120, 300];

export const MAX_RETRY_ATTEMPTS = RETRY_DELAYS_SECONDS.length;

export function getRetryDelaySeconds(retryCount) {
  if (!Number.isInteger(retryCount) || retryCount < 0) {
    return null;
  }

  return RETRY_DELAYS_SECONDS[retryCount] ?? null;
}

export function getNextRetryAt({ retryCount, now = new Date() }) {
  const delaySeconds = getRetryDelaySeconds(retryCount);
  if (!delaySeconds) {
    return null;
  }

  const baseTime = now instanceof Date && !Number.isNaN(now.getTime()) ? now.getTime() : Date.now();
  return new Date(baseTime + delaySeconds * 1000);
}

export function shouldRetryReminder({ retryCount, retryableError }) {
  if (!retryableError) {
    return false;
  }

  return retryCount < MAX_RETRY_ATTEMPTS;
}
