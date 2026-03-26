const DEFAULT_NANGO_BASE_URL = "https://api.nango.dev";

export class NangoApiError extends Error {
  constructor({ status, code = "", message, raw = null }) {
    super(message);
    this.name = "NangoApiError";
    this.status = status;
    this.code = code;
    this.raw = raw;
  }
}

function getNangoConfig() {
  const baseUrl = process.env.NANGO_BASE_URL?.trim() || DEFAULT_NANGO_BASE_URL;
  const secretKey = process.env.NANGO_SECRET_KEY?.trim();

  if (!secretKey) {
    throw new Error("Missing NANGO_SECRET_KEY.");
  }

  return { baseUrl, secretKey };
}

async function callNangoApi(pathname, payload) {
  const { baseUrl, secretKey } = getNangoConfig();
  const url = `${baseUrl.replace(/\/+$/, "")}${pathname}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseBodyText = await response.text();
  let parsed;
  try {
    parsed = responseBodyText ? JSON.parse(responseBodyText) : {};
  } catch {
    parsed = {};
  }

  if (!response.ok) {
    const details = extractErrorDetails(parsed, responseBodyText);
    const code = toText(parsed?.code);
    throw new NangoApiError({
      status: response.status,
      code,
      message: `Nango API failed (${response.status}): ${details}`,
      raw: parsed,
    });
  }

  return parsed;
}

function toText(value) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }

  return "";
}

function extractErrorDetails(parsed, fallbackText) {
  if (Array.isArray(parsed?.errors) && parsed.errors.length > 0) {
    const line = parsed.errors
      .map((item) => {
        const itemMessage = toText(item?.message);
        const itemPath = Array.isArray(item?.path) ? item.path.join(".") : toText(item?.path);
        if (itemMessage && itemPath) {
          return `${itemPath}: ${itemMessage}`;
        }

        return itemMessage || toText(item);
      })
      .filter(Boolean)
      .join("; ");

    if (line) {
      return line;
    }
  }

  const candidates = [
    parsed?.error?.message,
    parsed?.message,
    parsed?.error_description,
    parsed?.error,
    parsed?.details,
    parsed,
    fallbackText,
  ];

  for (const item of candidates) {
    const text = toText(item);
    if (text) {
      return text;
    }
  }

  return "Unknown Nango API error.";
}

export async function createNangoConnectSession({ endUserId, endUserEmail, integrationId }) {
  const payload = {
    end_user: {
      id: endUserId,
      email: endUserEmail,
      tags: {
        end_user_id: endUserId,
        end_user_email: endUserEmail,
      },
    },
    allowed_integrations: [integrationId],
  };

  const response = await callNangoApi("/connect/sessions", payload);
  const sessionToken =
    response?.token || response?.session_token || response?.data?.token || response?.data?.session_token || "";

  if (!sessionToken) {
    throw new Error("Nango connect session token is missing in API response.");
  }

  return sessionToken;
}
