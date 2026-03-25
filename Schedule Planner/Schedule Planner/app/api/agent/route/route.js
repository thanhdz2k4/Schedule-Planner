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

async function logRouterRun({ userId, inputText, result, status }) {
  await withTransaction(async (db) => {
    await ensureUserExists(db, userId);
    await db.query(
      `
        INSERT INTO agent_runs (user_id, intent, input_text, output_json, status)
        VALUES ($1::uuid, $2, $3, $4::jsonb, $5)
      `,
      [userId, result.intent || "query_data", inputText, JSON.stringify(result), status]
    );
  });
}

export async function POST(request) {
  let rawPayload;
  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json({ message: "Payload không hợp lệ." }, { status: 400 });
  }

  const payload = normalizeRequestPayload(rawPayload);
  if (!payload.text) {
    return NextResponse.json({ message: "Thiếu text để router." }, { status: 400 });
  }

  try {
    await ensureMigrations();
    const result = await routeUserText({
      text: payload.text,
      provider: payload.provider,
      context: payload.context,
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

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/agent/route failed:", error);

    try {
      await logRouterRun({
        userId: payload.userId,
        inputText: payload.text,
        result: {
          intent: "query_data",
          confidence: 0,
          entities: {},
          need_clarification: true,
          clarifying_question: "Không thể phân tích yêu cầu lúc này.",
          error: String(error?.message || error),
        },
        status: "failed",
      });
    } catch {}

    return NextResponse.json({ message: "Không thể route yêu cầu." }, { status: 500 });
  }
}
