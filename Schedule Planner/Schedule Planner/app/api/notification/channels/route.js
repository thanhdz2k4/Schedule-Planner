import { resolveSessionFromRequest } from "@/lib/auth/sessionRequest";
import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import {
  ensureDefaultNotificationChannelSettings,
  listNotificationChannelSettingsByUser,
  upsertNotificationChannelSetting,
} from "@/lib/db/queries/notificationChannelSettingQueries";
import { listIntegrationConnectionsByUser } from "@/lib/db/queries/integrationConnectionQueries";
import { ensureUserExists } from "@/lib/db/users";
import { isSupportedIntegrationId, SUPPORTED_INTEGRATIONS } from "@/lib/integrations/catalog";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizePriorityOrder(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(100, parsed));
}

function normalizePatchInput(item, index) {
  const channel = typeof item?.channel === "string" ? item.channel.trim() : "";
  if (!isSupportedIntegrationId(channel)) {
    return null;
  }

  return {
    channel,
    isEnabled: item?.isEnabled !== undefined ? Boolean(item.isEnabled) : true,
    priorityOrder: normalizePriorityOrder(item?.priorityOrder, index + 1),
    destination: typeof item?.destination === "string" ? item.destination.trim() : "",
  };
}

function mapChannelsForResponse(settings, connections) {
  const settingMap = new Map(settings.map((setting) => [setting.channel, setting]));
  const connectionMap = new Map(connections.map((connection) => [connection.integrationId, connection]));

  return SUPPORTED_INTEGRATIONS.map((integration, index) => {
    const setting = settingMap.get(integration.id) || {
      channel: integration.id,
      isEnabled: true,
      priorityOrder: index + 1,
      destination: "",
    };

    return {
      channel: integration.id,
      label: integration.label,
      provider: integration.provider,
      isEnabled: setting.isEnabled,
      priorityOrder: setting.priorityOrder,
      destination: setting.destination,
      connection: connectionMap.get(integration.id) || null,
    };
  }).sort((a, b) => a.priorityOrder - b.priorityOrder);
}

export async function GET(request) {
  const session = resolveSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ message: "Please login first." }, { status: 401 });
  }

  try {
    await ensureMigrations();

    const result = await withTransaction(async (db) => {
      await ensureUserExists(db, session.userId);
      await ensureDefaultNotificationChannelSettings(db, session.userId);

      const [settings, connections] = await Promise.all([
        listNotificationChannelSettingsByUser(db, session.userId),
        listIntegrationConnectionsByUser(db, session.userId),
      ]);

      return mapChannelsForResponse(settings, connections);
    });

    return NextResponse.json({ channels: result });
  } catch (error) {
    console.error("GET /api/notification/channels failed:", error);
    return NextResponse.json({ message: "Cannot load notification channels." }, { status: 500 });
  }
}

export async function PUT(request) {
  const session = resolveSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ message: "Please login first." }, { status: 401 });
  }

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid payload." }, { status: 400 });
  }

  const items = Array.isArray(payload?.channels) ? payload.channels : [];
  if (!items.length) {
    return NextResponse.json({ message: "channels array is required." }, { status: 400 });
  }

  const normalized = items
    .map((item, index) => normalizePatchInput(item, index))
    .filter((item) => item && isSupportedIntegrationId(item.channel));

  if (!normalized.length) {
    return NextResponse.json({ message: "No valid channels to update." }, { status: 400 });
  }

  try {
    await ensureMigrations();

    const result = await withTransaction(async (db) => {
      await ensureUserExists(db, session.userId);
      await ensureDefaultNotificationChannelSettings(db, session.userId);

      for (const item of normalized) {
        await upsertNotificationChannelSetting(db, {
          userId: session.userId,
          channel: item.channel,
          isEnabled: item.isEnabled,
          priorityOrder: item.priorityOrder,
          destination: item.destination,
        });
      }

      const [settings, connections] = await Promise.all([
        listNotificationChannelSettingsByUser(db, session.userId),
        listIntegrationConnectionsByUser(db, session.userId),
      ]);

      return mapChannelsForResponse(settings, connections);
    });

    return NextResponse.json({ channels: result });
  } catch (error) {
    console.error("PUT /api/notification/channels failed:", error);
    return NextResponse.json({ message: "Cannot update notification channels." }, { status: 500 });
  }
}
