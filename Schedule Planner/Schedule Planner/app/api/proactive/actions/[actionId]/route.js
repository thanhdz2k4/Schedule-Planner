import { resolveSessionFromRequest } from "@/lib/auth/sessionRequest";
import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import {
  deleteAssistantActionByIdForUser,
  getAssistantActionByIdForUser,
} from "@/lib/db/queries/assistantActionQueries";
import { ensureUserExists } from "@/lib/db/users";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NON_DELETABLE_STATUSES = new Set(["executing"]);

export async function DELETE(request, { params }) {
  const session = resolveSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ message: "Please login first." }, { status: 401 });
  }

  const actionId = typeof params?.actionId === "string" ? params.actionId.trim() : "";
  if (!actionId) {
    return NextResponse.json({ message: "actionId is required." }, { status: 400 });
  }

  try {
    await ensureMigrations();

    const result = await withTransaction(async (db) => {
      await ensureUserExists(db, session.userId);

      const existing = await getAssistantActionByIdForUser(db, {
        userId: session.userId,
        actionId,
      });

      if (!existing) {
        return { found: false };
      }

      if (NON_DELETABLE_STATUSES.has(existing.status)) {
        return {
          found: true,
          blocked: true,
          message: `Cannot delete action while status is '${existing.status}'.`,
          action: existing,
        };
      }

      const deleted = await deleteAssistantActionByIdForUser(db, {
        userId: session.userId,
        actionId,
      });

      return {
        found: true,
        blocked: false,
        deleted,
      };
    });

    if (!result.found) {
      return NextResponse.json({ message: "Assistant action not found." }, { status: 404 });
    }

    if (result.blocked) {
      return NextResponse.json(
        {
          message: result.message,
          action: result.action,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      deleted: result.deleted,
    });
  } catch (error) {
    console.error(`DELETE /api/proactive/actions/${actionId} failed:`, error);
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Cannot delete proactive action.",
      },
      { status: 500 }
    );
  }
}
