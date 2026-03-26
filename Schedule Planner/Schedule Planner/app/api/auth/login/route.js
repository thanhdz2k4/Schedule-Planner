import { createSessionToken } from "@/lib/auth/sessionToken";
import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import { authenticateUserAccount } from "@/lib/db/users";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: "Payload không hợp lệ." }, { status: 400 });
  }

  try {
    await ensureMigrations();

    const user = await withTransaction((db) =>
      authenticateUserAccount(db, {
        email: payload?.email,
        password: payload?.password,
      })
    );

    if (!user) {
      return NextResponse.json({ message: "Email hoặc mật khẩu không đúng." }, { status: 401 });
    }

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
    console.error("POST /api/auth/login failed:", error);
    return NextResponse.json({ message: "Không thể đăng nhập." }, { status: 500 });
  }
}
