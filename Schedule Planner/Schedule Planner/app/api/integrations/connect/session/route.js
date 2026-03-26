import { resolveSessionFromRequest } from "@/lib/auth/sessionRequest";
import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import { ensureUserExists } from "@/lib/db/users";
import { isSupportedIntegrationId, resolveProviderConfigKey } from "@/lib/integrations/catalog";
import { createNangoConnectSession, NangoApiError } from "@/lib/integrations/nangoClient";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const session = resolveSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ message: "Please login before connecting integrations." }, { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid payload." }, { status: 400 });
  }

  const integrationId = typeof payload?.integrationId === "string" ? payload.integrationId.trim() : "";
  if (!isSupportedIntegrationId(integrationId)) {
    return NextResponse.json({ message: "Unsupported integration." }, { status: 400 });
  }

  const providerConfigKey = resolveProviderConfigKey(integrationId);
  if (!providerConfigKey) {
    return NextResponse.json({ message: "Integration is not configured on server." }, { status: 400 });
  }

  try {
    await ensureMigrations();
    await withTransaction((db) => ensureUserExists(db, session.userId));

    const sessionToken = await createNangoConnectSession({
      endUserId: session.userId,
      endUserEmail: session.email,
      integrationId: providerConfigKey,
    });

    return NextResponse.json({ sessionToken });
  } catch (error) {
    console.error("POST /api/integrations/connect/session failed:", error);

    if (error instanceof NangoApiError) {
      const invalidIntegrationError = Array.isArray(error.raw?.errors)
        ? error.raw.errors.find(
            (item) =>
              Array.isArray(item?.path) &&
              item.path[0] === "allowed_integrations" &&
              typeof item?.message === "string" &&
              item.message.toLowerCase().includes("integration does not exist")
          )
        : null;

      if (invalidIntegrationError) {
        return NextResponse.json(
          {
            message: `NANGO_INTEGRATION_GMAIL='${providerConfigKey}' is invalid in your Nango workspace. Please set it to the exact provider config key shown in Nango dashboard.`,
          },
          { status: 400 }
        );
      }

      return NextResponse.json({ message: error.message }, { status: error.status || 500 });
    }

    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Cannot create integration connect session.",
      },
      { status: 500 }
    );
  }
}
