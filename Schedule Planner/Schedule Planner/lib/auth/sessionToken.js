import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = 1;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readSessionSecret() {
  return (
    process.env.AUTH_SESSION_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.PLANNER_DEFAULT_USER_ID ||
    "schedule-planner-dev-secret-change-me"
  );
}

function encodeBase64Url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payloadEncoded) {
  return createHmac("sha256", readSessionSecret()).update(payloadEncoded).digest("base64url");
}

function normalizeEmail(rawEmail) {
  if (typeof rawEmail !== "string") {
    return "";
  }

  return rawEmail.trim().toLowerCase();
}

export function createSessionToken(user) {
  const userId = typeof user?.id === "string" ? user.id.trim() : "";
  const email = normalizeEmail(user?.email);

  if (!UUID_REGEX.test(userId) || !email) {
    throw new Error("Cannot create session token because user payload is invalid.");
  }

  const now = Date.now();
  const payload = {
    v: TOKEN_VERSION,
    sub: userId,
    email,
    iat: now,
    exp: now + SESSION_TTL_MS,
  };

  const payloadEncoded = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(payloadEncoded);
  return `${payloadEncoded}.${signature}`;
}

export function verifySessionToken(token) {
  if (typeof token !== "string") {
    return null;
  }

  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }

  const [payloadEncoded, signature] = trimmed.split(".");
  if (!payloadEncoded || !signature) {
    return null;
  }

  const expectedSignature = signPayload(payloadEncoded);
  const signatureBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(payloadEncoded));
    if (payload?.v !== TOKEN_VERSION) {
      return null;
    }

    if (!UUID_REGEX.test(payload?.sub)) {
      return null;
    }

    if (typeof payload?.exp !== "number" || payload.exp <= Date.now()) {
      return null;
    }

    if (typeof payload?.email !== "string" || !payload.email.trim()) {
      return null;
    }

    return {
      userId: payload.sub,
      email: payload.email.trim().toLowerCase(),
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}

export function readBearerToken(request) {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return "";
  }

  const [scheme, value] = authorization.split(" ");
  if (!scheme || !value || scheme.toLowerCase() !== "bearer") {
    return "";
  }

  return value.trim();
}
