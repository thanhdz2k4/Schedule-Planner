import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

export const DEFAULT_USER_ID =
  typeof process.env.PLANNER_DEFAULT_USER_ID === "string" &&
  UUID_REGEX.test(process.env.PLANNER_DEFAULT_USER_ID)
    ? process.env.PLANNER_DEFAULT_USER_ID
    : "00000000-0000-0000-0000-000000000001";

export const DEFAULT_USER_TIMEZONE =
  typeof process.env.PLANNER_DEFAULT_TIMEZONE === "string" && process.env.PLANNER_DEFAULT_TIMEZONE.trim()
    ? process.env.PLANNER_DEFAULT_TIMEZONE.trim()
    : "Asia/Ho_Chi_Minh";

export class AuthInputError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "AuthInputError";
    this.code = code;
  }
}

function normalizeTimezone(rawTimezone) {
  if (typeof rawTimezone !== "string") {
    return DEFAULT_USER_TIMEZONE;
  }

  const trimmed = rawTimezone.trim();
  return trimmed || DEFAULT_USER_TIMEZONE;
}

function normalizeEmail(rawEmail) {
  if (typeof rawEmail !== "string") {
    return null;
  }

  const normalized = rawEmail.trim().toLowerCase();
  return EMAIL_REGEX.test(normalized) ? normalized : null;
}

function normalizePassword(rawPassword) {
  if (typeof rawPassword !== "string") {
    return null;
  }

  if (rawPassword.length < PASSWORD_MIN_LENGTH || rawPassword.length > PASSWORD_MAX_LENGTH) {
    return null;
  }

  return rawPassword;
}

function cleanUserRecord(row) {
  return {
    id: row.id,
    email: row.email,
    timezone: row.timezone || DEFAULT_USER_TIMEZONE,
  };
}

async function derivePasswordHash(password, salt, keyLength = SCRYPT_KEY_LENGTH) {
  const derived = await scryptAsync(password, salt, keyLength, SCRYPT_OPTIONS);
  return Buffer.from(derived).toString("base64");
}

async function verifyPassword(password, salt, storedHashBase64) {
  try {
    const expectedHash = Buffer.from(storedHashBase64, "base64");
    if (!expectedHash.length) {
      return false;
    }

    const computed = await scryptAsync(password, salt, expectedHash.length, SCRYPT_OPTIONS);
    const computedHash = Buffer.from(computed);
    if (computedHash.length !== expectedHash.length) {
      return false;
    }

    return timingSafeEqual(computedHash, expectedHash);
  } catch {
    return false;
  }
}

export function resolveUserId(rawUserId) {
  if (typeof rawUserId !== "string") {
    return DEFAULT_USER_ID;
  }

  const trimmed = rawUserId.trim();
  return UUID_REGEX.test(trimmed) ? trimmed : DEFAULT_USER_ID;
}

export async function ensureUserExists(db, userId, timezone = DEFAULT_USER_TIMEZONE) {
  await db.query(
    `
      INSERT INTO users (id, timezone)
      VALUES ($1::uuid, $2)
      ON CONFLICT (id)
      DO NOTHING
    `,
    [userId, normalizeTimezone(timezone)]
  );
}

export async function createUserAccount(db, { email, password, timezone = DEFAULT_USER_TIMEZONE }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new AuthInputError("Email không hợp lệ.", "INVALID_EMAIL");
  }

  const normalizedPassword = normalizePassword(password);
  if (!normalizedPassword) {
    throw new AuthInputError("Mật khẩu phải có từ 8 đến 128 ký tự.", "INVALID_PASSWORD");
  }

  const salt = randomBytes(16).toString("base64");
  const passwordHash = await derivePasswordHash(normalizedPassword, salt);

  try {
    const result = await db.query(
      `
        INSERT INTO users (email, password_salt, password_hash, timezone)
        VALUES ($1, $2, $3, $4)
        RETURNING id, email, timezone
      `,
      [normalizedEmail, salt, passwordHash, normalizeTimezone(timezone)]
    );

    return cleanUserRecord(result.rows[0]);
  } catch (error) {
    if (error?.code === "23505") {
      throw new AuthInputError("Email đã được sử dụng.", "EMAIL_EXISTS");
    }

    throw error;
  }
}

export async function authenticateUserAccount(db, { email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = normalizePassword(password);

  if (!normalizedEmail || !normalizedPassword) {
    return null;
  }

  const result = await db.query(
    `
      SELECT id, email, timezone, password_salt, password_hash
      FROM users
      WHERE lower(email) = $1
      LIMIT 1
    `,
    [normalizedEmail]
  );

  if (!result.rowCount) {
    return null;
  }

  const user = result.rows[0];
  if (!user.password_salt || !user.password_hash) {
    return null;
  }

  const passwordMatches = await verifyPassword(normalizedPassword, user.password_salt, user.password_hash);
  if (!passwordMatches) {
    return null;
  }

  return cleanUserRecord(user);
}
