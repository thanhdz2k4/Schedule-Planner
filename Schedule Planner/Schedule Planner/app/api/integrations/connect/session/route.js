import { resolveSessionFromRequest } from "@/lib/auth/sessionRequest";
import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import { ensureUserExists } from "@/lib/db/users";
import { getIntegrationEnvVarName, isSupportedIntegrationId, resolveProviderConfigKey } from "@/lib/integrations/catalog";
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
    const envVarName = getIntegrationEnvVarName(integrationId);
    const detail = envVarName
      ? `Set ${envVarName} in .env with your Nango provider config key.`
      : "Integration is not configured on server.";
    return NextResponse.json({ message: detail }, { status: 400 });
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
      const rawErrors = [
        ...(Array.isArray(error.raw?.errors) ? error.raw.errors : []),
        ...(Array.isArray(error.raw?.error?.errors) ? error.raw.error.errors : []),
      ];
      const invalidIntegrationError = rawErrors.find((item) => {
        const path = Array.isArray(item?.path) ? item.path : [item?.path];
        const firstPath = typeof path?.[0] === "string" ? path[0].trim() : "";
        return (
          firstPath === "allowed_integrations" &&
          typeof item?.message === "string" &&
          item.message.toLowerCase().includes("integration does not exist")
        );
      });

      if (invalidIntegrationError) {
        const envVarName = getIntegrationEnvVarName(integrationId);
        const envHint = envVarName ? `${envVarName}='${providerConfigKey}'` : providerConfigKey;
        return NextResponse.json(
          {
            message: `${envHint} is invalid in your Nango workspace. Please set it to the exact provider config key shown in Nango dashboard.`,
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
