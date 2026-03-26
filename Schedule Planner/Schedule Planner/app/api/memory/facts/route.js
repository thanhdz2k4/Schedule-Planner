import { resolveSessionFromRequest } from "@/lib/auth/sessionRequest";
import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import {
  listUserMemoryFacts,
  upsertUserMemoryFact,
} from "@/lib/db/queries/userMemoryQueries";
import { ensureUserExists } from "@/lib/db/users";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseLimit(value, fallback = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(500, parsed));
}

function normalizeFactPayload(payload) {
  return {
    factType: typeof payload?.factType === "string" ? payload.factType.trim() : "",
    factKey: typeof payload?.factKey === "string" ? payload.factKey.trim() : "",
    factValue: typeof payload?.factValue === "string" ? payload.factValue.trim() : "",
    confidence:
      Number.isFinite(Number(payload?.confidence)) && Number(payload.confidence) >= 0
        ? Number(payload.confidence)
        : 0.7,
    source: typeof payload?.source === "string" ? payload.source.trim() : "manual",
  };
}

export async function GET(request) {
  const session = resolveSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ message: "Please login first." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"), 100);
  const factType = typeof searchParams.get("factType") === "string" ? searchParams.get("factType").trim() : "";

  try {
    await ensureMigrations();

    const facts = await withTransaction(async (db) => {
      await ensureUserExists(db, session.userId);
      return listUserMemoryFacts(db, {
        userId: session.userId,
        factType,
        limit,
      });
    });

    return NextResponse.json({
      facts,
      count: facts.length,
      limit,
    });
  } catch (error) {
    console.error("GET /api/memory/facts failed:", error);
    return NextResponse.json({ message: "Cannot load memory facts." }, { status: 500 });
  }
}

export async function PUT(request) {
  const session = resolveSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ message: "Please login first." }, { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid payload." }, { status: 400 });
  }

  const normalized = normalizeFactPayload(payload);
  if (!normalized.factType || !normalized.factKey || !normalized.factValue) {
    return NextResponse.json(
      { message: "factType, factKey, factValue are required." },
      { status: 400 }
    );
  }

  try {
    await ensureMigrations();

    const fact = await withTransaction(async (db) => {
      await ensureUserExists(db, session.userId);
      return upsertUserMemoryFact(db, {
        userId: session.userId,
        factType: normalized.factType,
        factKey: normalized.factKey,
        factValue: normalized.factValue,
        confidence: normalized.confidence,
        source: normalized.source || "manual",
      });
    });

    return NextResponse.json({ fact });
  } catch (error) {
    console.error("PUT /api/memory/facts failed:", error);
    return NextResponse.json({ message: "Cannot save memory fact." }, { status: 500 });
  }
}
