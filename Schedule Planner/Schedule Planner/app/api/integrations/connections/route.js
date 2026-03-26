import { resolveSessionFromRequest } from "@/lib/auth/sessionRequest";
import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import { listIntegrationConnectionsByUser } from "@/lib/db/queries/integrationConnectionQueries";
import { ensureUserExists } from "@/lib/db/users";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const session = resolveSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ message: "Please login to view integration connections." }, { status: 401 });
  }

  try {
    await ensureMigrations();

    const connections = await withTransaction(async (db) => {
      await ensureUserExists(db, session.userId);
      return listIntegrationConnectionsByUser(db, session.userId);
    });

    return NextResponse.json({ connections });
  } catch (error) {
    console.error("GET /api/integrations/connections failed:", error);
    return NextResponse.json({ message: "Cannot load integration connections." }, { status: 500 });
  }
}
