import { resolveProviderConfigKey } from "@/lib/integrations/catalog";

import { resolveTelegramMessageFormat } from "@/lib/integrations/telegramHtml";

const DEFAULT_NANGO_BASE_URL = "https://api.nango.dev";
const DEFAULT_TELEGRAM_SEND_PATH = "/proxy/sendMessage";
const TRANSIENT_HTTP_STATUSES = new Set([408, 409, 429]);

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

function resolveTelegramProxyPath() {
  const raw = process.env.NANGO_TELEGRAM_SEND_PATH;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) {
    return DEFAULT_TELEGRAM_SEND_PATH;
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
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

export class TelegramSendError extends Error {
  constructor(message, { status = 0, code = "", retryable = false, raw = null } = {}) {
    super(message);
    this.name = "TelegramSendError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.raw = raw;
  }
}

function parseNangoErrorDetail(parsed, fallbackText) {
  const candidates = [
    parsed?.error?.message,
    parsed?.description,
    parsed?.message,
    parsed?.error,
    parsed,
    fallbackText,
  ];

  for (const item of candidates) {
    const text = toText(item);
    if (text) {
      return text;
    }
  }

  return "Unknown Nango Telegram error.";
}

function resolveExternalMessageId(parsed) {
  return (
    toText(parsed?.result?.message_id) ||
    toText(parsed?.message_id) ||
    toText(parsed?.result?.id) ||
    toText(parsed?.id) ||
    ""
  );
}

export async function sendTelegramReminder({
  connectionId,
  integrationId = "telegram",
  chatId,
  text,
  htmlText = "",
  parseMode = "",
}) {
  const trimmedConnectionId = typeof connectionId === "string" ? connectionId.trim() : "";
  if (!trimmedConnectionId) {
    throw new TelegramSendError("Missing Telegram connection id.", {
      code: "MISSING_CONNECTION_ID",
      retryable: false,
    });
  }

  const providerConfigKey = resolveProviderConfigKey(integrationId);
  if (!providerConfigKey) {
    throw new TelegramSendError("Integration provider config key is missing.", {
      code: "MISSING_PROVIDER_CONFIG_KEY",
      retryable: false,
    });
  }

  const nangoSecretKey = process.env.NANGO_SECRET_KEY?.trim();
  if (!nangoSecretKey) {
    throw new TelegramSendError("Missing NANGO_SECRET_KEY.", {
      code: "MISSING_NANGO_SECRET_KEY",
      retryable: false,
    });
  }

  const safeChatId = typeof chatId === "string" ? chatId.trim() : `${chatId || ""}`.trim();
  if (!safeChatId) {
    throw new TelegramSendError("Missing Telegram chat id. Save your Telegram chat id first.", {
      code: "MISSING_CHAT_ID",
      retryable: false,
    });
  }

  const safeText = typeof text === "string" ? text.trim() : "";
  if (!safeText) {
    throw new TelegramSendError("Missing Telegram message text.", {
      code: "MISSING_MESSAGE_TEXT",
      retryable: false,
    });
  }

  const nangoBaseUrl = process.env.NANGO_BASE_URL?.trim() || DEFAULT_NANGO_BASE_URL;
  const url = `${nangoBaseUrl.replace(/\/+$/, "")}${resolveTelegramProxyPath()}`;
  const formatted = resolveTelegramMessageFormat({
    text: safeText,
    htmlText,
    parseMode,
  });

  const payload = {
    chat_id: safeChatId,
    text: formatted.text,
    disable_web_page_preview: true,
  };

  if (formatted.parseMode) {
    payload.parse_mode = formatted.parseMode;
  }

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
    throw new TelegramSendError(
      `Telegram send failed before response: ${networkError instanceof Error ? networkError.message : "Unknown network error."}`,
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
    const errorCode = toText(parsed?.error_code) || toText(parsed?.error?.code) || toText(parsed?.code);
    throw new TelegramSendError(`Telegram send failed (${response.status}): ${detail}`, {
      status: response.status,
      code: errorCode,
      retryable: isRetryableStatus(response.status),
      raw: parsed,
    });
  }

  return {
    externalMessageId: resolveExternalMessageId(parsed),
    response: parsed,
    providerConfigKey,
  };
}
