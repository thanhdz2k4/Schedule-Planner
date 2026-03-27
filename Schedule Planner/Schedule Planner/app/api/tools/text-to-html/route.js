import { convertTextToTelegramHtml } from "@/lib/integrations/telegramHtml";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  let payload = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  if (!text) {
    return NextResponse.json({ message: "text is required." }, { status: 400 });
  }

  const html = convertTextToTelegramHtml(text);
  return NextResponse.json({
    ok: true,
    text,
    html,
    parse_mode: html ? "HTML" : "",
  });
}
