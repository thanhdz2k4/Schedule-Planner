import { resolveSessionFromRequest } from "@/lib/auth/sessionRequest";
import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import { listAssistantActionsByUser } from "@/lib/db/queries/assistantActionQueries";
import { ensureUserExists } from "@/lib/db/users";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUS = new Set([
  "proposed",
  "pending_approval",
  "approved",
  "denied",
  "executing",
  "executed",
  "failed",
  "canceled",
]);

function normalizeLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 50;
  }

  return Math.max(1, Math.min(200, parsed));
}

function normalizeOffset(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function normalizeStatus(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return ALLOWED_STATUS.has(normalized) ? normalized : "";
}

function normalizeActionType(value) {
  return typeof value === "string" ? value.trim() : "";
}

function summarizeByStatus(actions) {
  const summary = {};
  for (const action of actions) {
    const key = action.status || "unknown";
    summary[key] = (summary[key] || 0) + 1;
  }
  return summary;
}

export async function GET(request) {
  const session = resolveSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ message: "Please login first." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = normalizeStatus(searchParams.get("status"));
  const actionType = normalizeActionType(searchParams.get("actionType"));
  const limit = normalizeLimit(searchParams.get("limit"));
  const offset = normalizeOffset(searchParams.get("offset"));

  try {
    await ensureMigrations();

    const actions = await withTransaction(async (db) => {
      await ensureUserExists(db, session.userId);
      return listAssistantActionsByUser(db, {
        userId: session.userId,
        status,
        actionType,
        limit,
        offset,
      });
    });

    return NextResponse.json({
      actions,
      count: actions.length,
      summary: summarizeByStatus(actions),
      filters: {
        status,
        actionType,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error("GET /api/proactive/actions failed:", error);
    return NextResponse.json({ message: "Cannot load proactive actions." }, { status: 500 });
  }
}
