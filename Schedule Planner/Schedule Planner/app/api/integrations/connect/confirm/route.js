import { resolveSessionFromRequest } from "@/lib/auth/sessionRequest";
import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import { upsertIntegrationConnection } from "@/lib/db/queries/integrationConnectionQueries";
import { ensureUserExists } from "@/lib/db/users";
import { isSupportedIntegrationId } from "@/lib/integrations/catalog";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const session = resolveSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ message: "Please login before confirming integration." }, { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid payload." }, { status: 400 });
  }

  const integrationId = typeof payload?.integrationId === "string" ? payload.integrationId.trim() : "";
  const connectionId = typeof payload?.connectionId === "string" ? payload.connectionId.trim() : "";
  const provider = typeof payload?.provider === "string" ? payload.provider.trim() : "";

  if (!isSupportedIntegrationId(integrationId)) {
    return NextResponse.json({ message: "Unsupported integration." }, { status: 400 });
  }

  if (!connectionId) {
    return NextResponse.json({ message: "Missing connectionId." }, { status: 400 });
  }

  try {
    await ensureMigrations();
    const saved = await withTransaction(async (db) => {
      await ensureUserExists(db, session.userId);
      return upsertIntegrationConnection(db, {
        userId: session.userId,
        integrationId,
        connectionId,
        provider,
        status: "active",
        lastError: "",
      });
    });

    return NextResponse.json({ connection: saved });
  } catch (error) {
    console.error("POST /api/integrations/connect/confirm failed:", error);
    return NextResponse.json({ message: "Cannot confirm integration connection." }, { status: 500 });
  }
}
