import { loadUserMemoryContext, persistMemoryTurn } from "@/lib/agent/memory";
import { normalizeContext, routeUserText } from "@/lib/agent/router";
import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import { ensureUserExists, resolveUserId } from "@/lib/db/users";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeProvider(rawProvider) {
  const value = typeof rawProvider === "string" ? rawProvider.trim().toLowerCase() : "";
  if (value === "rule" || value === "mistral" || value === "auto") {
    return value;
  }
  return undefined;
}

function normalizeRequestPayload(payload) {
  return {
    userId: resolveUserId(payload?.userId),
    text: typeof payload?.text === "string" ? payload.text.trim() : "",
    provider: normalizeProvider(payload?.provider),
    context: normalizeContext(payload?.context),
  };
}

function mergeContextWithMemory(baseContext, memoryContext) {
  const context = normalizeContext(baseContext);
  const contextEntities =
    context.entities && typeof context.entities === "object" && !Array.isArray(context.entities)
      ? context.entities
      : {};

  return normalizeContext({
    ...context,
    entities: {
      ...(memoryContext.entityDefaults || {}),
      ...contextEntities,
    },
    memory_facts: Array.isArray(memoryContext.routerMemoryFacts)
      ? memoryContext.routerMemoryFacts
      : [],
  });
}

async function resolveMemoryContextForUser(userId) {
  return withTransaction(async (db) => {
    await ensureUserExists(db, userId);
    return loadUserMemoryContext(db, {
      userId,
      limit: 60,
    });
  });
}

async function logRouterRun({ userId, inputText, result, status }) {
  await withTransaction(async (db) => {
    await ensureUserExists(db, userId);
    await db.query(
      `
        INSERT INTO agent_runs (user_id, intent, input_text, output_json, status)
        VALUES ($1::uuid, $2, $3, $4::jsonb, $5)
      `,
      [userId, result?.intent || "query_data", inputText, JSON.stringify(result || {}), status]
    );
  });
}

async function persistMemoryForRoute({ userId, text, result, status }) {
  await withTransaction(async (db) => {
    await ensureUserExists(db, userId);
    await persistMemoryTurn(db, {
      userId,
      text,
      routeResult: result,
      execution: {
        ok: status === "success",
        stage: "routing",
      },
      source: "agent_route_turn",
    });
  });
}

export async function POST(request) {
  let rawPayload;
  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid payload." }, { status: 400 });
  }

  const payload = normalizeRequestPayload(rawPayload);
  if (!payload.text) {
    return NextResponse.json({ message: "Missing text for routing." }, { status: 400 });
  }

  try {
    await ensureMigrations();

    const memoryContext = await resolveMemoryContextForUser(payload.userId);
    const result = await routeUserText({
      text: payload.text,
      provider: payload.provider,
      context: mergeContextWithMemory(payload.context, memoryContext),
    });

    try {
      await logRouterRun({
        userId: payload.userId,
        inputText: payload.text,
        result,
        status: "success",
      });
    } catch (logError) {
      console.error("Router logging failed:", logError);
    }

    try {
      await persistMemoryForRoute({
        userId: payload.userId,
        text: payload.text,
        result,
        status: "success",
      });
    } catch (memoryError) {
      console.error("Router memory persist failed:", memoryError);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/agent/route failed:", error);

    const fallbackResult = {
      intent: "query_data",
      confidence: 0,
      entities: {},
      need_clarification: true,
      clarifying_question: "Cannot parse your request right now.",
      error: String(error?.message || error),
    };

    try {
      await logRouterRun({
        userId: payload.userId,
        inputText: payload.text,
        result: fallbackResult,
        status: "failed",
      });
    } catch {}

    try {
      await persistMemoryForRoute({
        userId: payload.userId,
        text: payload.text,
        result: fallbackResult,
        status: "failed",
      });
    } catch {}

    return NextResponse.json({ message: "Cannot route request right now." }, { status: 500 });
  }
}