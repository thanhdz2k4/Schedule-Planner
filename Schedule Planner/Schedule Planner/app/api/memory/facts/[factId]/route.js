import { resolveSessionFromRequest } from "@/lib/auth/sessionRequest";
import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import {
  deleteUserMemoryFactById,
  getUserMemoryFactById,
} from "@/lib/db/queries/userMemoryQueries";
import { ensureUserExists } from "@/lib/db/users";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request, { params }) {
  const session = resolveSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ message: "Please login first." }, { status: 401 });
  }

  const factId = typeof params?.factId === "string" ? params.factId.trim() : "";
  if (!factId) {
    return NextResponse.json({ message: "factId is required." }, { status: 400 });
  }

  try {
    await ensureMigrations();

    const result = await withTransaction(async (db) => {
      await ensureUserExists(db, session.userId);

      const existing = await getUserMemoryFactById(db, {
        userId: session.userId,
        factId,
      });
      if (!existing) {
        return { deleted: false, found: false };
      }

      const deleted = await deleteUserMemoryFactById(db, {
        userId: session.userId,
        factId,
      });

      return { deleted, found: true };
    });

    if (!result.found) {
      return NextResponse.json({ message: "Memory fact not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: result.deleted });
  } catch (error) {
    console.error(`DELETE /api/memory/facts/${factId} failed:`, error);
    return NextResponse.json({ message: "Cannot delete memory fact." }, { status: 500 });
  }
}
