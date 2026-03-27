import { isInternalSchedulerAuthorized } from "@/lib/auth/internalSchedulerRequest";
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
  if (!isInternalSchedulerAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized scheduler request." }, { status: 401 });
  }

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  try {
    const result = await dispatchReminderJobs({
      userId: null,
      limit: normalizeLimit(payload?.limit || process.env.REMINDER_DISPATCH_LIMIT),
      includeFuture: Boolean(payload?.includeFuture),
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error("POST /api/internal/reminders/dispatch failed:", error);
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Cannot run internal reminder dispatch.",
      },
      { status: 500 }
    );
  }
}
