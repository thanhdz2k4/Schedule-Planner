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

function parseBooleanFlag(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
  }

  return false;
}

async function runDispatch({ limit, includeFuture }) {
  const result = await dispatchReminderJobs({
    userId: null,
    limit: normalizeLimit(limit || process.env.REMINDER_DISPATCH_LIMIT),
    includeFuture: parseBooleanFlag(includeFuture),
  });

  return NextResponse.json({
    ok: true,
    ...result,
  });
}

export async function GET(request) {
  if (!isInternalSchedulerAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized scheduler request." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    return await runDispatch({
      limit: searchParams.get("limit"),
      includeFuture: searchParams.get("includeFuture"),
    });
  } catch (error) {
    console.error("GET /api/internal/reminders/dispatch failed:", error);
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Cannot run internal reminder dispatch.",
      },
      { status: 500 }
    );
  }
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
    return await runDispatch({
      limit: payload?.limit,
      includeFuture: payload?.includeFuture,
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
