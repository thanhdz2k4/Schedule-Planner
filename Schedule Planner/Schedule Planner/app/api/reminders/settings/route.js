import { resolveSessionFromRequest } from "@/lib/auth/sessionRequest";
import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import {
  getReminderUserSettingByUser,
  upsertReminderUserSetting,
} from "@/lib/db/queries/reminderUserSettingQueries";
import { listTasksByUser, rebuildReminderJobsForUser } from "@/lib/db/queries/taskQueries";
import { ensureUserExists } from "@/lib/db/users";
import { MAX_REMINDER_LEAD_SECONDS, normalizeLeadSeconds } from "@/lib/reminder/scheduler";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toResponseSetting(setting) {
  const leadSeconds = normalizeLeadSeconds(setting?.leadSeconds);

  return {
    leadSeconds,
    leadMinutes: leadSeconds / 60,
    maxLeadSeconds: MAX_REMINDER_LEAD_SECONDS,
    display:
      leadSeconds % 60 === 0
        ? { value: leadSeconds / 60, unit: "minutes" }
        : { value: leadSeconds, unit: "seconds" },
  };
}

function normalizeUnit(unit) {
  if (typeof unit !== "string") {
    return "";
  }

  const trimmed = unit.trim().toLowerCase();
  if (trimmed === "seconds" || trimmed === "second" || trimmed === "sec" || trimmed === "s") {
    return "seconds";
  }
  if (trimmed === "minutes" || trimmed === "minute" || trimmed === "min" || trimmed === "m") {
    return "minutes";
  }
  return "";
}

function parseLeadSecondsFromPayload(payload) {
  if (payload?.leadSeconds !== undefined && payload?.leadSeconds !== null && payload?.leadSeconds !== "") {
    const parsed = Number.parseInt(payload.leadSeconds, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return {
        error: "leadSeconds must be an integer >= 0.",
      };
    }

    return {
      leadSeconds: normalizeLeadSeconds(parsed),
    };
  }

  const rawValue = payload?.value;
  const unit = normalizeUnit(payload?.unit);
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return {
      error: "Either leadSeconds or value + unit is required.",
    };
  }

  if (!unit) {
    return {
      error: "unit must be 'seconds' or 'minutes'.",
    };
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    return {
      error: "value must be an integer >= 0.",
    };
  }

  const leadSeconds = unit === "minutes" ? parsedValue * 60 : parsedValue;
  return {
    leadSeconds: normalizeLeadSeconds(leadSeconds),
  };
}

export async function GET(request) {
  const session = resolveSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ message: "Please login first." }, { status: 401 });
  }

  try {
    await ensureMigrations();

    const result = await withTransaction(async (db) => {
      await ensureUserExists(db, session.userId);
      const setting = await getReminderUserSettingByUser(db, session.userId);
      return toResponseSetting(setting);
    });

    return NextResponse.json({ setting: result });
  } catch (error) {
    console.error("GET /api/reminders/settings failed:", error);
    return NextResponse.json({ message: "Cannot load reminder settings." }, { status: 500 });
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

  const parsed = parseLeadSecondsFromPayload(payload);
  if (!Number.isInteger(parsed.leadSeconds)) {
    return NextResponse.json({ message: parsed.error || "Invalid reminder setting payload." }, { status: 400 });
  }

  try {
    await ensureMigrations();

    const result = await withTransaction(async (db) => {
      await ensureUserExists(db, session.userId);

      const setting = await upsertReminderUserSetting(db, {
        userId: session.userId,
        leadSeconds: parsed.leadSeconds,
      });

      const tasks = await listTasksByUser(db, session.userId);
      await rebuildReminderJobsForUser(db, session.userId, tasks, {
        leadSeconds: setting.leadSeconds,
      });

      return {
        setting: toResponseSetting(setting),
        tasksScanned: tasks.length,
        jobsRebuilt: tasks.filter((task) => task.status !== "done").length,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("PUT /api/reminders/settings failed:", error);
    return NextResponse.json({ message: "Cannot save reminder settings." }, { status: 500 });
  }
}
