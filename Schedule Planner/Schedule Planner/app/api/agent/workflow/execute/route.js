import { executeWorkflow } from "@/lib/agent/workflow-engine";
import { normalizeContext, routeUserText } from "@/lib/agent/router";
import { ensureMigrations } from "@/lib/db/migrate";
import { resolveUserId } from "@/lib/db/users";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIRECT_INTENTS = new Set(["create_task", "update_task", "delete_task", "query_data"]);

function normalizeProvider(rawProvider) {
  const value = typeof rawProvider === "string" ? rawProvider.trim().toLowerCase() : "";
  if (value === "rule" || value === "mistral" || value === "auto") {
    return value;
  }
  return undefined;
}

function normalizeDirectIntent(rawIntent) {
  if (typeof rawIntent !== "string") {
    return null;
  }
  const intent = rawIntent.trim();
  return DIRECT_INTENTS.has(intent) ? intent : null;
}

function normalizePayload(payload) {
  return {
    userId: resolveUserId(payload?.userId),
    text: typeof payload?.text === "string" ? payload.text.trim() : "",
    provider: normalizeProvider(payload?.provider),
    context: normalizeContext(payload?.context),
    intent: normalizeDirectIntent(payload?.intent),
    entities:
      payload?.entities && typeof payload.entities === "object" && !Array.isArray(payload.entities)
        ? payload.entities
        : {},
  };
}

async function resolveRouteResult(payload) {
  if (payload.intent) {
    return {
      intent: payload.intent,
      entities: payload.entities,
      need_clarification: false,
      clarifying_question: null,
      source: "direct",
      confidence: 1,
      context_for_next_turn: {
        intent: payload.intent,
        entities: payload.entities,
        last_user_text: payload.text || null,
        last_agent_question: null,
      },
    };
  }

  if (!payload.text) {
    return null;
  }

  return routeUserText({
    text: payload.text,
    provider: payload.provider,
    context: payload.context,
  });
}

export async function POST(request) {
  let rawPayload;
  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json({ message: "Payload is invalid." }, { status: 400 });
  }

  const payload = normalizePayload(rawPayload);

  if (!payload.intent && !payload.text) {
    return NextResponse.json(
      { message: "text is required when intent is not provided." },
      { status: 400 }
    );
  }

  try {
    await ensureMigrations();

    const routeResult = await resolveRouteResult(payload);
    if (!routeResult) {
      return NextResponse.json({ message: "Unable to resolve route result." }, { status: 400 });
    }

    if (routeResult.need_clarification) {
      return NextResponse.json({
        ok: false,
        stage: "routing",
        route: routeResult,
        message: routeResult.clarifying_question || "Need clarification before execution.",
      });
    }

    const execution = await executeWorkflow({
      userId: payload.userId,
      intent: routeResult.intent,
      entities: routeResult.entities,
      text: payload.text,
    });

    if (!execution.ok) {
      const status = execution.error?.status || 500;
      return NextResponse.json(
        {
          ok: false,
          stage: "workflow",
          route: routeResult,
          execution,
        },
        { status }
      );
    }

    return NextResponse.json({
      ok: true,
      route: routeResult,
      execution,
    });
  } catch (error) {
    console.error("POST /api/agent/workflow/execute failed:", error);
    return NextResponse.json({ message: "Cannot execute workflow right now." }, { status: 500 });
  }
}
