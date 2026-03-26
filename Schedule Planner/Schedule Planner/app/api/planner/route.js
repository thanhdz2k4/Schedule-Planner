import { readBearerToken, verifySessionToken } from "@/lib/auth/sessionToken";
import { resolveUserId } from "@/lib/db/users";
import { readPlannerState, writePlannerState } from "@/lib/plannerDb";
import { syncGoalProgress } from "@/lib/plannerStore";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeStateShape(input) {
  const normalized = {
    tasks: Array.isArray(input?.tasks) ? input.tasks : [],
    goals: Array.isArray(input?.goals) ? input.goals : [],
  };

  syncGoalProgress(normalized);
  return normalized;
}

function resolveRequestUser(request, bodyUserId) {
  const token = readBearerToken(request);
  if (token) {
    const session = verifySessionToken(token);
    if (!session) {
      return { userId: null, unauthorized: true };
    }

    return { userId: session.userId, unauthorized: false };
  }

  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("userId");
  const fromHeader = request.headers.get("x-user-id");

  return {
    userId: resolveUserId(fromQuery || fromHeader || bodyUserId),
    unauthorized: false,
  };
}

export async function GET(request) {
  const resolved = resolveRequestUser(request);
  if (resolved.unauthorized || !resolved.userId) {
    return NextResponse.json({ message: "Session is invalid." }, { status: 401 });
  }

  try {
    const state = await readPlannerState(resolved.userId);
    if (!state) {
      return NextResponse.json({ tasks: [], goals: [] });
    }

    return NextResponse.json(state);
  } catch (error) {
    console.error("GET /api/planner failed:", error);
    return NextResponse.json({ message: "Cannot read planner data from database." }, { status: 500 });
  }
}

export async function PUT(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid payload." }, { status: 400 });
  }

  const resolved = resolveRequestUser(request, payload?.userId);
  if (resolved.unauthorized || !resolved.userId) {
    return NextResponse.json({ message: "Session is invalid." }, { status: 401 });
  }

  try {
    const state = normalizeStateShape(payload);
    const saved = await writePlannerState(state, resolved.userId);
    return NextResponse.json(saved);
  } catch (error) {
    console.error("PUT /api/planner failed:", error);
    return NextResponse.json({ message: "Cannot save planner data to database." }, { status: 500 });
  }
}
