import { resolveSessionFromRequest } from "@/lib/auth/sessionRequest";
import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import {
  getChatThreadByIdAndUser,
  listChatMessagesByThread,
} from "@/lib/db/queries/chatThreadQueries";
import { ensureUserExists } from "@/lib/db/users";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    return 200;
  }

  return Math.max(1, Math.min(1000, parsed));
}

export async function GET(request, { params }) {
  const session = resolveSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ message: "Please login to view chat messages." }, { status: 401 });
  }

  const threadId = typeof params?.threadId === "string" ? params.threadId.trim() : "";
  if (!threadId) {
    return NextResponse.json({ message: "threadId is required." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));

  try {
    await ensureMigrations();

    const result = await withTransaction(async (db) => {
      await ensureUserExists(db, session.userId);

      const thread = await getChatThreadByIdAndUser(db, {
        userId: session.userId,
        threadId,
      });
      if (!thread) {
        return null;
      }

      const messages = await listChatMessagesByThread(db, {
        threadId,
        limit,
      });

      return { thread, messages };
    });

    if (!result) {
      return NextResponse.json({ message: "Chat thread not found." }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error(`GET /api/chat/threads/${threadId}/messages failed:`, error);
    return NextResponse.json({ message: "Cannot load chat messages." }, { status: 500 });
  }
}
