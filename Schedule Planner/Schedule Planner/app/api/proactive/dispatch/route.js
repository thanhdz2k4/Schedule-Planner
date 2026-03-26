import { resolveSessionFromRequest } from "@/lib/auth/sessionRequest";
import { dispatchProactiveJobs } from "@/worker/proactiveWorker";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeUserLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 1;
  }

  return Math.max(1, Math.min(50, parsed));
}

export async function POST(request) {
  const session = resolveSessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { message: "Please login before dispatching proactive planner jobs." },
      { status: 401 }
    );
  }

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  try {
    const result = await dispatchProactiveJobs({
      userId: session.userId,
      userLimit: normalizeUserLimit(payload?.userLimit),
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error("POST /api/proactive/dispatch failed:", error);
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Cannot dispatch proactive planner jobs.",
      },
      { status: 500 }
    );
  }
}
