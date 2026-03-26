import { resolveSessionFromRequest } from "@/lib/auth/sessionRequest";
import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import {
  ensureDefaultAssistantPolicies,
  listAssistantPoliciesByUser,
  listPolicyActionTypes,
  upsertAssistantPolicy,
} from "@/lib/db/queries/assistantPolicyQueries";
import { ensureUserExists } from "@/lib/db/users";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_POLICY_MODES = new Set(["auto", "ask", "deny"]);
const ALLOWED_ACTION_TYPES = new Set(listPolicyActionTypes());

function normalizePolicyItem(item) {
  const actionType = typeof item?.actionType === "string" ? item.actionType.trim() : "";
  const mode = typeof item?.mode === "string" ? item.mode.trim() : "";

  if (!ALLOWED_ACTION_TYPES.has(actionType)) {
    return null;
  }

  if (!VALID_POLICY_MODES.has(mode)) {
    return null;
  }

  return {
    actionType,
    mode,
  };
}

export async function GET(request) {
  const session = resolveSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ message: "Please login first." }, { status: 401 });
  }

  try {
    await ensureMigrations();

    const policies = await withTransaction(async (db) => {
      await ensureUserExists(db, session.userId);
      await ensureDefaultAssistantPolicies(db, session.userId);
      return listAssistantPoliciesByUser(db, session.userId);
    });

    return NextResponse.json({
      policies,
      actionTypes: listPolicyActionTypes(),
      modes: ["auto", "ask", "deny"],
    });
  } catch (error) {
    console.error("GET /api/proactive/policies failed:", error);
    return NextResponse.json({ message: "Cannot load proactive policies." }, { status: 500 });
  }
}

export async function PUT(request) {
  const session = resolveSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ message: "Please login first." }, { status: 401 });
  }

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid payload." }, { status: 400 });
  }

  const items = Array.isArray(payload?.policies)
    ? payload.policies
    : payload?.actionType && payload?.mode
    ? [payload]
    : [];

  const normalizedItems = items.map(normalizePolicyItem).filter(Boolean);
  if (!normalizedItems.length) {
    return NextResponse.json(
      { message: "policies must contain valid { actionType, mode } values." },
      { status: 400 }
    );
  }

  try {
    await ensureMigrations();

    const policies = await withTransaction(async (db) => {
      await ensureUserExists(db, session.userId);
      await ensureDefaultAssistantPolicies(db, session.userId);

      for (const item of normalizedItems) {
        await upsertAssistantPolicy(db, {
          userId: session.userId,
          actionType: item.actionType,
          mode: item.mode,
        });
      }

      return listAssistantPoliciesByUser(db, session.userId);
    });

    return NextResponse.json({
      policies,
    });
  } catch (error) {
    console.error("PUT /api/proactive/policies failed:", error);
    return NextResponse.json({ message: "Cannot update proactive policies." }, { status: 500 });
  }
}
