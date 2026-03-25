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

export async function GET() {
  try {
    const state = await readPlannerState();
    if (!state) {
      return NextResponse.json({ tasks: [], goals: [] });
    }
    return NextResponse.json(state);
  } catch (error) {
    console.error("GET /api/planner failed:", error);
    return NextResponse.json({ message: "Không thể đọc dữ liệu từ database." }, { status: 500 });
  }
}

export async function PUT(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: "Payload không hợp lệ." }, { status: 400 });
  }

  try {
    const state = normalizeStateShape(payload);
    const saved = await writePlannerState(state);
    return NextResponse.json(saved);
  } catch (error) {
    console.error("PUT /api/planner failed:", error);
    return NextResponse.json({ message: "Không thể lưu dữ liệu vào database." }, { status: 500 });
  }
}
