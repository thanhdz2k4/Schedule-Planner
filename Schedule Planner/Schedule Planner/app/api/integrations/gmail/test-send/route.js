import { resolveSessionFromRequest } from "@/lib/auth/sessionRequest";
import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import { getIntegrationConnectionByUser } from "@/lib/db/queries/integrationConnectionQueries";
import { ensureUserExists } from "@/lib/db/users";
import { resolveProviderConfigKey } from "@/lib/integrations/catalog";
import { GmailSendError, sendGmailReminder } from "@/lib/integrations/gmailSender";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const session = resolveSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ message: "Please login before testing Gmail send." }, { status: 401 });
  }

  const providerConfigKey = resolveProviderConfigKey("gmail");
  if (!providerConfigKey) {
    return NextResponse.json(
      {
        message: "NANGO_INTEGRATION_GMAIL is missing. Set it to your Gmail provider config key in Nango.",
      },
      { status: 400 }
    );
  }

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const toEmail = typeof payload?.to === "string" && payload.to.trim() ? payload.to.trim() : session.email;
  const subject =
    typeof payload?.subject === "string" && payload.subject.trim()
      ? payload.subject.trim()
      : "[Schedule Planner] Test Gmail connection";
  const body =
    typeof payload?.body === "string" && payload.body.trim()
      ? payload.body.trim()
      : `Gmail test sent at ${new Date().toISOString()}\nConnection is working.`;

  try {
    await ensureMigrations();

    const connection = await withTransaction(async (db) => {
      await ensureUserExists(db, session.userId);
      return getIntegrationConnectionByUser(db, session.userId, "gmail");
    });

    if (!connection || !connection.connectionId) {
      return NextResponse.json({ message: "Gmail is not connected yet." }, { status: 400 });
    }

    if (connection.status !== "active") {
      return NextResponse.json(
        { message: `Gmail connection is '${connection.status}'. Please reconnect first.` },
        { status: 400 }
      );
    }

    const result = await sendGmailReminder({
      connectionId: connection.connectionId,
      integrationId: "gmail",
      toEmail,
      subject,
      textBody: body,
      htmlBody: "",
    });

    return NextResponse.json({
      ok: true,
      message: `Test email sent to ${toEmail}.`,
      result: result.response,
      externalMessageId: result.externalMessageId || "",
    });
  } catch (error) {
    console.error("POST /api/integrations/gmail/test-send failed:", error);

    if (error instanceof GmailSendError) {
      const status = error.status || (error.code.startsWith("MISSING_") ? 400 : 500);
      return NextResponse.json({ message: error.message }, { status });
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Cannot send test Gmail email." },
      { status: 500 }
    );
  }
}
