import { resolveProviderConfigKey } from "@/lib/integrations/catalog";

const DEFAULT_NANGO_BASE_URL = "https://api.nango.dev";
const TRANSIENT_HTTP_STATUSES = new Set([408, 409, 429]);

function toBase64UrlUtf8(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function sanitizeHeaderValue(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/[\r\n]+/g, " ").trim();
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

function buildMimeMessage({ toEmail, subject, textBody, htmlBody }) {
  const safeTo = sanitizeHeaderValue(toEmail);
  const safeSubject = sanitizeHeaderValue(subject || "[Schedule Planner] Reminder");
  const safeTextBody = typeof textBody === "string" && textBody.trim() ? textBody : "Reminder from Schedule Planner.";
  const safeHtmlBody = typeof htmlBody === "string" ? htmlBody.trim() : "";

  if (safeHtmlBody) {
    const boundary = `schedule-planner-${Date.now()}`;
    const lines = [
      `To: ${safeTo}`,
      `Subject: ${safeSubject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary=\"${boundary}\"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      safeTextBody,
      "",
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "",
      safeHtmlBody,
      "",
      `--${boundary}--`,
      "",
    ];

    return lines.join("\r\n");
  }

  const lines = [
    `To: ${safeTo}`,
    `Subject: ${safeSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    safeTextBody,
    "",
  ];

  return lines.join("\r\n");
}

function isRetryableStatus(status) {
  if (!Number.isInteger(status)) {
    return true;
  }

  if (status >= 500) {
    return true;
  }

  return TRANSIENT_HTTP_STATUSES.has(status);
}

export class GmailSendError extends Error {
  constructor(message, { status = 0, code = "", retryable = false, raw = null } = {}) {
    super(message);
    this.name = "GmailSendError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.raw = raw;
  }
}

function parseNangoErrorDetail(parsed, fallbackText) {
  const candidates = [parsed?.error?.message, parsed?.message, parsed?.error, parsed, fallbackText];

  for (const item of candidates) {
    const text = toText(item);
    if (text) {
      return text;
    }
  }

  return "Unknown Nango Gmail error.";
}

export async function sendGmailReminder({
  connectionId,
  integrationId = "gmail",
  toEmail,
  subject,
  textBody,
  htmlBody,
}) {
  const trimmedConnectionId = typeof connectionId === "string" ? connectionId.trim() : "";
  if (!trimmedConnectionId) {
    throw new GmailSendError("Missing Gmail connection id.", {
      code: "MISSING_CONNECTION_ID",
      retryable: false,
    });
  }

  const safeToEmail = typeof toEmail === "string" ? toEmail.trim() : "";
  if (!safeToEmail) {
    throw new GmailSendError("Missing recipient email.", {
      code: "MISSING_RECIPIENT_EMAIL",
      retryable: false,
    });
  }

  const providerConfigKey = resolveProviderConfigKey(integrationId);
  if (!providerConfigKey) {
    throw new GmailSendError("Integration provider config key is missing.", {
      code: "MISSING_PROVIDER_CONFIG_KEY",
      retryable: false,
    });
  }

  const nangoSecretKey = process.env.NANGO_SECRET_KEY?.trim();
  if (!nangoSecretKey) {
    throw new GmailSendError("Missing NANGO_SECRET_KEY.", {
      code: "MISSING_NANGO_SECRET_KEY",
      retryable: false,
    });
  }

  const nangoBaseUrl = process.env.NANGO_BASE_URL?.trim() || DEFAULT_NANGO_BASE_URL;
  const url = `${nangoBaseUrl.replace(/\/+$/, "")}/proxy/gmail/v1/users/me/messages/send`;
  const payload = {
    raw: toBase64UrlUtf8(
      buildMimeMessage({
        toEmail: safeToEmail,
        subject,
        textBody,
        htmlBody,
      })
    ),
  };

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${nangoSecretKey}`,
        "Provider-Config-Key": providerConfigKey,
        "Connection-Id": trimmedConnectionId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (networkError) {
    throw new GmailSendError(
      `Gmail send failed before response: ${networkError instanceof Error ? networkError.message : "Unknown network error."}`,
      {
        code: "NETWORK_ERROR",
        retryable: true,
      }
    );
  }

  const responseText = await response.text();
  let parsed;
  try {
    parsed = responseText ? JSON.parse(responseText) : {};
  } catch {
    parsed = {};
  }

  if (!response.ok) {
    const detail = parseNangoErrorDetail(parsed, responseText);
    const errorCode = toText(parsed?.error?.code) || toText(parsed?.code);
    throw new GmailSendError(`Gmail send failed (${response.status}): ${detail}`, {
      status: response.status,
      code: errorCode,
      retryable: isRetryableStatus(response.status),
      raw: parsed,
    });
  }

  return {
    externalMessageId: toText(parsed?.id) || "",
    response: parsed,
    providerConfigKey,
  };
}
