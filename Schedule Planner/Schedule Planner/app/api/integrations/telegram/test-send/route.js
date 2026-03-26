import { resolveSessionFromRequest } from "@/lib/auth/sessionRequest";
import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import { getIntegrationConnectionByUser } from "@/lib/db/queries/integrationConnectionQueries";
import { getNotificationChannelSettingByUser } from "@/lib/db/queries/notificationChannelSettingQueries";
import { ensureUserExists } from "@/lib/db/users";
import { resolveProviderConfigKey } from "@/lib/integrations/catalog";
import { sendTelegramReminder, TelegramSendError } from "@/lib/integrations/telegramSender";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toFriendlyTelegramError(message) {
  const normalized = typeof message === "string" ? message.toLowerCase() : "";
  if (normalized.includes("bots can't send messages to bots")) {
    return "Telegram chat id hien tai la bot. Hay dung chat id cua user/group va nhan /start voi bot truoc.";
  }

  if (normalized.includes("chat not found")) {
    return "Khong tim thay Telegram chat id. Hay nhap dung chat id va nhan /start voi bot truoc.";
  }

  if (normalized.includes("bot was blocked")) {
    return "Bot da bi chan boi user. Hay mo chan bot trong Telegram va thu lai.";
  }

  return message;
}

function resolveChatId(preferred, fallback) {
  const first = typeof preferred === "string" ? preferred.trim() : "";
  if (first) {
    return first;
  }

  const second = typeof fallback === "string" ? fallback.trim() : "";
  if (second) {
    return second;
  }

  return "";
}

export async function POST(request) {
  const session = resolveSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ message: "Please login before testing Telegram send." }, { status: 401 });
  }

  const providerConfigKey = resolveProviderConfigKey("telegram");
  if (!providerConfigKey) {
    return NextResponse.json(
      {
        message: "NANGO_INTEGRATION_TELEGRAM is missing. Set it to your Telegram provider config key in Nango.",
      },
      { status: 400 }
    );
  }

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  try {
    await ensureMigrations();

    const context = await withTransaction(async (db) => {
      await ensureUserExists(db, session.userId);

      const [connection, setting] = await Promise.all([
        getIntegrationConnectionByUser(db, session.userId, "telegram"),
        getNotificationChannelSettingByUser(db, session.userId, "telegram"),
      ]);

      return { connection, setting };
    });

    if (!context.connection || !context.connection.connectionId) {
      return NextResponse.json({ message: "Telegram is not connected yet." }, { status: 400 });
    }

    if (context.connection.status !== "active") {
      return NextResponse.json(
        { message: `Telegram connection is '${context.connection.status}'. Please reconnect first.` },
        { status: 400 }
      );
    }

    const chatId = resolveChatId(payload?.chatId, payload?.destination || context.setting?.destination || process.env.TELEGRAM_DEFAULT_CHAT_ID);
    if (!chatId) {
      return NextResponse.json(
        {
          message: "Missing Telegram chat id. Save destination in channel settings first.",
        },
        { status: 400 }
      );
    }

    const text =
      typeof payload?.text === "string" && payload.text.trim()
        ? payload.text.trim()
        : `[Schedule Planner] Telegram test sent at ${new Date().toISOString()}`;

    const result = await sendTelegramReminder({
      connectionId: context.connection.connectionId,
      integrationId: "telegram",
      chatId,
      text,
    });

    return NextResponse.json({
      ok: true,
      message: `Test Telegram message sent to chat ${chatId}.`,
      result: result.response,
      externalMessageId: result.externalMessageId || "",
    });
  } catch (error) {
    console.error("POST /api/integrations/telegram/test-send failed:", error);

    if (error instanceof TelegramSendError) {
      const status = error.status || (error.code.startsWith("MISSING_") ? 400 : 500);
      return NextResponse.json({ message: toFriendlyTelegramError(error.message) }, { status });
    }

    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Cannot send test Telegram message.",
      },
      { status: 500 }
    );
  }
}
