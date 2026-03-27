import { createSessionToken } from "@/lib/auth/sessionToken";
import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import { AuthInputError, createUserAccount } from "@/lib/db/users";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapAuthInputError(error) {
  if (!(error instanceof AuthInputError)) {
    return null;
  }

  if (error.code === "EMAIL_EXISTS") {
    return NextResponse.json({ code: error.code, message: error.message }, { status: 409 });
  }

  return NextResponse.json({ code: error.code, message: error.message }, { status: 400 });
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ code: "INVALID_PAYLOAD", message: "Invalid payload." }, { status: 400 });
  }

  try {
    await ensureMigrations();

    const user = await withTransaction((db) =>
      createUserAccount(db, {
        email: payload?.email,
        password: payload?.password,
        timezone: payload?.timezone,
      })
    );

    const token = createSessionToken(user);
    return NextResponse.json({
      session: {
        token,
        userId: user.id,
        email: user.email,
      },
      user,
    });
  } catch (error) {
    const mappedError = mapAuthInputError(error);
    if (mappedError) {
      return mappedError;
    }

    console.error("POST /api/auth/register failed:", error);
    return NextResponse.json(
      { code: "REGISTER_FAILED", message: "Cannot create account right now." },
      { status: 500 }
    );
  }
}