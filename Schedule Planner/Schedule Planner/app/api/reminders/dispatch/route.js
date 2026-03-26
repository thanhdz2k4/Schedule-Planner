import { resolveSessionFromRequest } from "@/lib/auth/sessionRequest";
import { dispatchReminderJobs } from "@/worker/reminderWorker";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 20;
  }

  return Math.min(parsed, 200);
}

export async function POST(request) {
  const session = resolveSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ message: "Please login before dispatching reminders." }, { status: 401 });
  }

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  try {
    const result = await dispatchReminderJobs({
      userId: session.userId,
      limit: normalizeLimit(payload?.limit),
      includeFuture: Boolean(payload?.includeFuture),
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error("POST /api/reminders/dispatch failed:", error);
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Cannot dispatch reminder jobs.",
      },
      { status: 500 }
    );
  }
}
