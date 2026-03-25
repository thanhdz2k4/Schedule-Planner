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

function resolveRequestUserId(request, bodyUserId) {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("userId");
  const fromHeader = request.headers.get("x-user-id");
  return resolveUserId(fromQuery || fromHeader || bodyUserId);
}

export async function GET(request) {
  const userId = resolveRequestUserId(request);

  try {
    const state = await readPlannerState(userId);
    if (!state) {
      return NextResponse.json({ tasks: [], goals: [] });
    }
    return NextResponse.json(state);
  } catch (error) {
    console.error("GET /api/planner failed:", error);
    return NextResponse.json({ message: "Không th? d?c d? li?u t? database." }, { status: 500 });
  }
}

export async function PUT(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: "Payload không h?p l?." }, { status: 400 });
  }

  const userId = resolveRequestUserId(request, payload?.userId);

  try {
    const state = normalizeStateShape(payload);
    const saved = await writePlannerState(state, userId);
    return NextResponse.json(saved);
  } catch (error) {
    console.error("PUT /api/planner failed:", error);
    return NextResponse.json({ message: "Không th? luu d? li?u vào database." }, { status: 500 });
  }
}

