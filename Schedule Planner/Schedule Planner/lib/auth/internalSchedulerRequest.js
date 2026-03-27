import { timingSafeEqual } from "node:crypto";

function readHeader(request, names) {
  for (const name of names) {
    const value = request.headers.get(name);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function readBearerToken(request) {
  const authorization = readHeader(request, ["authorization"]);
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return "";
  }

  return match[1].trim();
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") {
    return false;
  }

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function isInternalSchedulerAuthorized(request) {
  const expected = process.env.INTERNAL_SCHEDULER_TOKEN?.trim();
  if (!expected) {
    return false;
  }

  const actual =
    readHeader(request, ["x-scheduler-token", "x-internal-scheduler-token"]) || readBearerToken(request);
  if (!actual) {
    return false;
  }

  return safeEqual(actual, expected);
}
