import { resolveSessionFromRequest } from "@/lib/auth/sessionRequest";
import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import {
  getAssistantActionByIdForUser,
  updateAssistantActionStatus,
} from "@/lib/db/queries/assistantActionQueries";
import { ensureUserExists } from "@/lib/db/users";
import { executeAssistantActionNow } from "@/lib/proactive/actionService";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeDecision(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized === "approve" || normalized === "deny" || normalized === "execute") {
    return normalized;
  }

  return "";
}

function canApprove(status) {
  return status === "pending_approval" || status === "approved" || status === "failed";
}

function canDeny(status) {
  return status === "pending_approval" || status === "approved";
}

function canExecute(status) {
  return status === "approved" || status === "failed" || status === "executing";
}

export async function POST(request, { params }) {
  const session = resolveSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ message: "Please login first." }, { status: 401 });
  }

  const actionId = typeof params?.actionId === "string" ? params.actionId.trim() : "";
  if (!actionId) {
    return NextResponse.json({ message: "actionId is required." }, { status: 400 });
  }

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const decision = normalizeDecision(payload?.decision);
  if (!decision) {
    return NextResponse.json(
      { message: "decision must be one of: approve, deny, execute." },
      { status: 400 }
    );
  }

  const executeNow = payload?.executeNow !== undefined ? Boolean(payload.executeNow) : true;

  try {
    await ensureMigrations();

    const state = await withTransaction(async (db) => {
      await ensureUserExists(db, session.userId);

      const action = await getAssistantActionByIdForUser(db, {
        userId: session.userId,
        actionId,
      });

      if (!action) {
        return { found: false };
      }

      if (decision === "approve") {
        if (!canApprove(action.status)) {
          return {
            found: true,
            invalid: true,
            message: `Cannot approve action in status '${action.status}'.`,
            action,
          };
        }

        const approved =
          action.status === "approved"
            ? action
            : await updateAssistantActionStatus(db, {
                actionId: action.id,
                status: "approved",
                approvedBy: session.userId,
                approvedAt: new Date(),
                errorMessage: "",
              });

        return {
          found: true,
          action: approved,
          shouldExecute: executeNow,
        };
      }

      if (decision === "deny") {
        if (!canDeny(action.status)) {
          return {
            found: true,
            invalid: true,
            message: `Cannot deny action in status '${action.status}'.`,
            action,
          };
        }

        const denied = await updateAssistantActionStatus(db, {
          actionId: action.id,
          status: "denied",
          approvedBy: session.userId,
          approvedAt: new Date(),
          errorMessage: "",
        });

        return {
          found: true,
          action: denied,
          shouldExecute: false,
        };
      }

      if (!canExecute(action.status)) {
        return {
          found: true,
          invalid: true,
          message: `Cannot execute action in status '${action.status}'.`,
          action,
        };
      }

      const readyToExecute =
        action.status === "approved" || action.status === "executing"
          ? action
          : await updateAssistantActionStatus(db, {
              actionId: action.id,
              status: "approved",
              approvedBy: session.userId,
              approvedAt: new Date(),
              errorMessage: "",
            });

      return {
        found: true,
        action: readyToExecute,
        shouldExecute: true,
      };
    });

    if (!state.found) {
      return NextResponse.json({ message: "Assistant action not found." }, { status: 404 });
    }

    if (state.invalid) {
      return NextResponse.json(
        {
          message: state.message,
          action: state.action,
        },
        { status: 409 }
      );
    }

    if (!state.shouldExecute) {
      return NextResponse.json({
        ok: true,
        action: state.action,
      });
    }

    const executed = await executeAssistantActionNow(state.action.id);
    return NextResponse.json({
      ok: true,
      action: executed,
    });
  } catch (error) {
    console.error(`POST /api/proactive/actions/${actionId}/decision failed:`, error);
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Cannot update assistant action decision.",
      },
      { status: 500 }
    );
  }
}
