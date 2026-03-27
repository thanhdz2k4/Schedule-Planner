import { runAgentLabTurn } from "@/lib/agent/chatBridge";
import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import {
  insertChatMessage,
  updateChatThreadContext,
  upsertChatThreadByUserAndExternalChatId,
} from "@/lib/db/queries/chatThreadQueries";
import {
  getIntegrationConnectionByUser,
  getIntegrationConnectionByConnectionId,
  listActiveIntegrationConnectionsByIntegration,
} from "@/lib/db/queries/integrationConnectionQueries";
import { listNotificationChannelSettingsByChannelAndDestination } from "@/lib/db/queries/notificationChannelSettingQueries";
import { ensureUserExists } from "@/lib/db/users";
import { convertTextToTelegramHtml } from "@/lib/integrations/telegramHtml";
import { sendTelegramReminder, TelegramSendError } from "@/lib/integrations/telegramSender";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class ChatWebhookError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ChatWebhookError";
    this.status = status;
  }
}

function readHeader(request, names) {
  for (const name of names) {
    const value = request.headers.get(name);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function verifyWebhookSecret(request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN?.trim();
  if (!expected) {
    return true;
  }

  const actual = readHeader(request, [
    "x-telegram-bot-api-secret-token",
    "x-telegram-webhook-secret",
    "x-chat-webhook-secret",
  ]);

  return actual === expected;
}

function toObject(value) {
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {}
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
}

function toText(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value}`;
  }

  return "";
}

function pickFirstText(candidates) {
  for (const value of candidates) {
    const text = toText(value);
    if (text) {
      return text;
    }
  }

  return "";
}

function isTelegramUpdateShape(value) {
  const candidate = toObject(value);
  if (!Object.keys(candidate).length) {
    return false;
  }

  if (!Number.isInteger(candidate.update_id)) {
    return false;
  }

  return Boolean(
    candidate.message ||
      candidate.edited_message ||
      candidate.channel_post ||
      candidate.edited_channel_post ||
      candidate.callback_query
  );
}

function extractEnvelope(payload, request) {
  const body = toObject(payload);
  const nestedPayload = toObject(body.payload);
  const nestedData = toObject(body.data);
  const nestedBody = toObject(body.body);
  const nestedEvent = toObject(body.event);

  const connectionId = pickFirstText([
    body.connectionId,
    body.connection_id,
    body?.connection?.id,
    body?.metadata?.connectionId,
    body?.metadata?.connection_id,
    nestedPayload.connectionId,
    nestedPayload.connection_id,
    nestedData.connectionId,
    nestedData.connection_id,
    nestedBody.connectionId,
    nestedBody.connection_id,
    nestedEvent.connectionId,
    nestedEvent.connection_id,
    readHeader(request, ["x-nango-connection-id", "connection-id", "x-connection-id"]),
  ]);

  const updateCandidates = [
    body,
    nestedBody,
    nestedData,
    nestedPayload,
    nestedEvent,
    toObject(nestedBody.payload),
    toObject(nestedData.payload),
    toObject(nestedPayload.payload),
  ];

  const update = updateCandidates.find((item) => isTelegramUpdateShape(item)) || {};

  return {
    connectionId,
    update,
  };
}

function extractTelegramMessage(update) {
  const payload = toObject(update);
  return payload.message || payload.edited_message || payload.channel_post || payload.edited_channel_post || null;
}

function getInboundText(message) {
  const text = pickFirstText([message?.text, message?.caption]);
  return text;
}

function getChatId(message) {
  return pickFirstText([message?.chat?.id]);
}

function getMessageExternalId(message) {
  return pickFirstText([message?.message_id]);
}

function buildThreadTitle(message) {
  const chat = toObject(message?.chat);
  const from = toObject(message?.from);

  const title = pickFirstText([chat.title]);
  if (title) {
    return title;
  }

  const firstName = toText(from.first_name);
  const lastName = toText(from.last_name);
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (fullName) {
    return fullName;
  }

  const username = toText(from.username);
  if (username) {
    return username.startsWith("@") ? username : `@${username}`;
  }

  return "Telegram chat";
}

function buildCommandReply(text) {
  if (/^\/start(?:@\w+)?$/i.test(text)) {
    return "Schedule Planner da ket noi. Ban co the nhan tin nhu Agent Lab ngay tren Telegram.";
  }

  if (/^\/help(?:@\w+)?$/i.test(text)) {
    return "Ban co the nhan: tao task, sua task, xoa task, hoi lich hom nay, hoac thong ke cong viec.";
  }

  return "";
}

async function resolveTelegramConnection(db, { connectionId, chatId }) {
  if (connectionId) {
    const byConnectionId = await getIntegrationConnectionByConnectionId(db, connectionId);
    if (!byConnectionId || byConnectionId.integrationId !== "telegram") {
      throw new ChatWebhookError("Unknown Telegram connection_id in webhook payload.", 400);
    }

    if (byConnectionId.status !== "active") {
      throw new ChatWebhookError(
        `Telegram connection is '${byConnectionId.status}'. Reconnect this integration first.`,
        400
      );
    }

    return byConnectionId;
  }

  const matchedChannels = await listNotificationChannelSettingsByChannelAndDestination(db, {
    channel: "telegram",
    destination: chatId,
  });
  const matchedEnabledChannels = matchedChannels.filter((item) => item.isEnabled);
  const matchedUsers = matchedEnabledChannels.length ? matchedEnabledChannels : matchedChannels;

  if (matchedUsers.length === 1) {
    const byChatIdConnection = await getIntegrationConnectionByUser(db, matchedUsers[0].userId, "telegram");
    if (!byChatIdConnection || byChatIdConnection.status !== "active") {
      throw new ChatWebhookError(
        "Telegram chat id is saved but integration connection is not active. Reconnect Telegram first.",
        400
      );
    }

    return byChatIdConnection;
  }

  if (matchedUsers.length > 1) {
    throw new ChatWebhookError(
      "Telegram chat id is linked to multiple users. Set connection_id in webhook payload.",
      400
    );
  }

  const active = await listActiveIntegrationConnectionsByIntegration(db, "telegram");
  if (active.length === 1) {
    return active[0];
  }

  if (!active.length) {
    throw new ChatWebhookError("No active Telegram integration is available.", 400);
  }

  throw new ChatWebhookError(
    "Webhook payload is missing connection_id while multiple Telegram connections are active.",
    400
  );
}

async function persistInboundMessage({ connection, chatId, title, userText, inboundExternalMessageId, rawPayload }) {
  return withTransaction(async (db) => {
    await ensureUserExists(db, connection.userId);

    const thread = await upsertChatThreadByUserAndExternalChatId(db, {
      userId: connection.userId,
      channel: "telegram",
      externalChatId: chatId,
      title,
      lastMessageAt: new Date(),
    });

    if (inboundExternalMessageId) {
      const duplicated = await db.query(
        `
          SELECT id
          FROM chat_messages
          WHERE thread_id = $1::uuid
            AND direction = 'inbound'
            AND external_message_id = $2
          LIMIT 1
        `,
        [thread.id, inboundExternalMessageId]
      );

      if (duplicated.rowCount) {
        return {
          thread,
          duplicated: true,
        };
      }
    }

    await insertChatMessage(db, {
      threadId: thread.id,
      role: "user",
      direction: "inbound",
      content: userText,
      externalMessageId: inboundExternalMessageId,
      rawPayload,
    });

    return {
      thread,
      duplicated: false,
    };
  });
}

async function persistOutboundMessage({ threadId, replyText, externalMessageId, rawPayload, nextContext }) {
  return withTransaction(async (db) => {
    await insertChatMessage(db, {
      threadId,
      role: "assistant",
      direction: "outbound",
      content: replyText,
      externalMessageId,
      rawPayload,
    });

    await updateChatThreadContext(db, {
      threadId,
      context: nextContext,
      lastMessageAt: new Date(),
    });
  });
}

export async function POST(request) {
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json({ message: "Invalid Telegram webhook secret token." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid Telegram webhook payload." }, { status: 400 });
  }

  const envelope = extractEnvelope(body, request);
  const message = extractTelegramMessage(envelope.update);
  if (!message) {
    return NextResponse.json({ ok: true, ignored: true, reason: "No message payload." });
  }

  if (message?.from?.is_bot) {
    return NextResponse.json({ ok: true, ignored: true, reason: "Message from bot ignored." });
  }

  const userText = getInboundText(message);
  if (!userText) {
    return NextResponse.json({ ok: true, ignored: true, reason: "No text/caption in message." });
  }

  const chatId = getChatId(message);
  if (!chatId) {
    return NextResponse.json({ message: "Telegram chat id is missing in message payload." }, { status: 400 });
  }

  try {
    await ensureMigrations();

    const connection = await withTransaction((db) =>
      resolveTelegramConnection(db, {
        connectionId: envelope.connectionId,
        chatId,
      })
    );
    const inboundPersist = await persistInboundMessage({
      connection,
      chatId,
      title: buildThreadTitle(message),
      userText,
      inboundExternalMessageId: getMessageExternalId(message),
      rawPayload: {
        envelope,
        update: envelope.update,
      },
    });
    if (inboundPersist.duplicated) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "Duplicate inbound message.",
        threadId: inboundPersist.thread.id,
      });
    }

    const thread = inboundPersist.thread;

    const commandReply = buildCommandReply(userText);
    const turnResult = commandReply
      ? {
          ok: true,
          stage: "command",
          routeResult: null,
          execution: null,
          replyText: commandReply,
          nextContext: thread.context,
        }
      : await runAgentLabTurn({
          userId: connection.userId,
          text: userText,
          context: thread.context,
          provider: "auto",
        });

    const replyHtml = convertTextToTelegramHtml(turnResult.replyText);

    const sendResult = await sendTelegramReminder({
      connectionId: connection.connectionId,
      integrationId: "telegram",
      chatId,
      text: turnResult.replyText,
      htmlText: replyHtml,
      parseMode: replyHtml ? "HTML" : "",
    });

    await persistOutboundMessage({
      threadId: thread.id,
      replyText: turnResult.replyText,
      externalMessageId: sendResult.externalMessageId,
      rawPayload: {
        stage: turnResult.stage,
        routeResult: turnResult.routeResult,
        execution: turnResult.execution,
        replyHtml,
        telegramResponse: sendResult.response,
      },
      nextContext: turnResult.nextContext,
    });

    return NextResponse.json({
      ok: true,
      threadId: thread.id,
      stage: turnResult.stage,
      replyText: turnResult.replyText,
      replyHtml,
    });
  } catch (error) {
    if (error instanceof ChatWebhookError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    if (error instanceof TelegramSendError) {
      console.error("POST /api/chat/telegram/webhook send failed:", error);
      const status =
        (error.status && error.status >= 400 && error.status) ||
        (error.code && error.code.startsWith("MISSING_") ? 400 : 502);
      return NextResponse.json({ message: error.message }, { status });
    }

    console.error("POST /api/chat/telegram/webhook failed:", error);
    return NextResponse.json({ message: "Cannot process Telegram chat webhook." }, { status: 500 });
  }
}
