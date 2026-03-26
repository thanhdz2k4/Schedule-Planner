import { createHmac, timingSafeEqual } from "node:crypto";
import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import { upsertIntegrationConnection } from "@/lib/db/queries/integrationConnectionQueries";
import { ensureUserExists } from "@/lib/db/users";
import { resolvePublicIntegrationIdByProviderConfigKey } from "@/lib/integrations/catalog";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeCompareString(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function extractNangoSignature(request) {
  return (
    request.headers.get("x-nango-signature") ||
    request.headers.get("x-nango-signature-256") ||
    request.headers.get("nango-signature") ||
    ""
  ).trim();
}

function verifyNangoWebhookSignature(request, rawBody) {
  const webhookSecret = process.env.NANGO_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return false;
  }

  const incomingSignature = extractNangoSignature(request);
  if (!incomingSignature) {
    return false;
  }

  const digestHex = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  const digestBase64 = createHmac("sha256", webhookSecret).update(rawBody).digest("base64");

  return (
    safeCompareString(incomingSignature, digestHex) ||
    safeCompareString(incomingSignature, `sha256=${digestHex}`) ||
    safeCompareString(incomingSignature, digestBase64) ||
    safeCompareString(incomingSignature, `sha256=${digestBase64}`)
  );
}

function resolveWebhookUserId(payload) {
  const tags = payload?.tags && typeof payload.tags === "object" ? payload.tags : {};
  const rawUserId = tags.end_user_id || tags.endUserId || tags.user_id || tags.userId || "";

  return typeof rawUserId === "string" && UUID_REGEX.test(rawUserId.trim()) ? rawUserId.trim() : "";
}

function normalizeWebhookPayload(payload) {
  const type = typeof payload?.type === "string" ? payload.type.trim() : "";
  const operation = typeof payload?.operation === "string" ? payload.operation.trim() : "";
  const success = Boolean(payload?.success);
  const connectionId =
    typeof payload?.connectionId === "string"
      ? payload.connectionId.trim()
      : typeof payload?.connection_id === "string"
      ? payload.connection_id.trim()
      : "";
  const providerConfigKey =
    typeof payload?.providerConfigKey === "string"
      ? payload.providerConfigKey.trim()
      : typeof payload?.provider_config_key === "string"
      ? payload.provider_config_key.trim()
      : typeof payload?.integration_id === "string"
      ? payload.integration_id.trim()
      : "";
  const integrationId = resolvePublicIntegrationIdByProviderConfigKey(providerConfigKey);
  const provider = typeof payload?.provider === "string" ? payload.provider.trim() : "";
  const userId = resolveWebhookUserId(payload);
  const errorMessage =
    typeof payload?.error === "string"
      ? payload.error
      : typeof payload?.error?.message === "string"
      ? payload.error.message
      : typeof payload?.message === "string"
      ? payload.message
      : "";

  let status = "active";
  if (operation === "deletion") {
    status = "disconnected";
  } else if (!success) {
    status = "error";
  }

  return {
    type,
    operation,
    success,
    userId,
    connectionId,
    providerConfigKey,
    integrationId,
    provider,
    status,
    errorMessage,
  };
}

export async function POST(request) {
  const rawBody = await request.text();
  if (!verifyNangoWebhookSignature(request, rawBody)) {
    return NextResponse.json({ message: "Invalid webhook signature." }, { status: 401 });
  }

  let payload;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ message: "Invalid webhook payload." }, { status: 400 });
  }

  const normalized = normalizeWebhookPayload(payload);

  // Only process auth lifecycle events in this phase.
  if (normalized.type && normalized.type !== "auth") {
    return NextResponse.json({ received: true, ignored: true });
  }

  if (!normalized.userId || !normalized.connectionId || !normalized.integrationId) {
    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    await ensureMigrations();
    await withTransaction(async (db) => {
      await ensureUserExists(db, normalized.userId);
      await upsertIntegrationConnection(db, {
        userId: normalized.userId,
        integrationId: normalized.integrationId,
        connectionId: normalized.connectionId,
        provider: normalized.provider,
        status: normalized.status,
        lastError: normalized.status === "active" ? "" : normalized.errorMessage,
      });
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("POST /api/integrations/webhooks/nango failed:", error);
    return NextResponse.json({ message: "Cannot process integration webhook." }, { status: 500 });
  }
}
