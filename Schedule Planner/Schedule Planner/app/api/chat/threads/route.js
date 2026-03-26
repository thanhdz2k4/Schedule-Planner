import { resolveSessionFromRequest } from "@/lib/auth/sessionRequest";
import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import { listChatThreadsByUser } from "@/lib/db/queries/chatThreadQueries";
import { ensureUserExists } from "@/lib/db/users";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseIntInRange(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, parsed));
}

export async function GET(request) {
  const session = resolveSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ message: "Please login to view chat threads." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseIntInRange(searchParams.get("limit"), 30, 1, 200);
  const offset = parseIntInRange(searchParams.get("offset"), 0, 0, 10000);

  try {
    await ensureMigrations();

    const threads = await withTransaction(async (db) => {
      await ensureUserExists(db, session.userId);
      return listChatThreadsByUser(db, {
        userId: session.userId,
        limit,
        offset,
      });
    });

    return NextResponse.json({ threads, limit, offset });
  } catch (error) {
    console.error("GET /api/chat/threads failed:", error);
    return NextResponse.json({ message: "Cannot load chat threads." }, { status: 500 });
  }
}
