import {
  createAssistantAction,
  getAssistantActionById,
  updateAssistantActionStatus,
} from "@/lib/db/queries/assistantActionQueries";
import {
  ensureDefaultAssistantPolicies,
  getAssistantPolicyMode,
} from "@/lib/db/queries/assistantPolicyQueries";
import { getIntegrationConnectionByUser, listIntegrationConnectionsByUser } from "@/lib/db/queries/integrationConnectionQueries";
import {
  ensureDefaultNotificationChannelSettings,
  listNotificationChannelSettingsByUser,
} from "@/lib/db/queries/notificationChannelSettingQueries";
import { GmailSendError, sendGmailReminder } from "@/lib/integrations/gmailSender";
import { TelegramSendError, sendTelegramReminder } from "@/lib/integrations/telegramSender";
import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";

const CHANNEL_ORDER_DEFAULT = ["telegram", "gmail"];
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}$/;
const DELIVERY_PROVIDER_BY_CHANNEL = {
  gmail: "nango-gmail",
  telegram: "nango-telegram",
};

function normalizeEnabledChannels(settings) {
  const enabled = settings
    .filter((item) => item.isEnabled && CHANNEL_ORDER_DEFAULT.includes(item.channel))
    .sort((a, b) => a.priorityOrder - b.priorityOrder)
    .map((item) => item.channel);

  return enabled.length ? enabled : [...CHANNEL_ORDER_DEFAULT];
}

function resolveDestination({ channel, setting, userEmail }) {
  const explicitDestination =
    typeof setting?.destination === "string" ? setting.destination.trim() : "";

  if (channel === "telegram") {
    const fallback =
      typeof process.env.TELEGRAM_DEFAULT_CHAT_ID === "string"
        ? process.env.TELEGRAM_DEFAULT_CHAT_ID.trim()
        : "";
    return explicitDestination || fallback;
  }

  if (channel === "gmail") {
    return explicitDestination || userEmail || "";
  }

  return "";
}

function initialStatusByMode(mode) {
  if (mode === "deny") {
    return "denied";
  }
  if (mode === "auto") {
    return "approved";
  }
  return "pending_approval";
}

function summarizeSendError(error) {
  if (error instanceof TelegramSendError || error instanceof GmailSendError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown proactive send error.";
}

function normalizeRescheduleSuggestion(item) {
  const taskId = typeof item?.task_id === "string" ? item.task_id.trim() : "";
  const suggestedDate = typeof item?.suggested_date === "string" ? item.suggested_date.trim() : "";
  const suggestedStart = typeof item?.suggested_start === "string" ? item.suggested_start.trim() : "";
  const suggestedEnd = typeof item?.suggested_end === "string" ? item.suggested_end.trim() : "";

  if (!taskId || !ISO_DATE_REGEX.test(suggestedDate) || !TIME_REGEX.test(suggestedStart) || !TIME_REGEX.test(suggestedEnd)) {
    return null;
  }

  return {
    taskId,
    suggestedDate,
    suggestedStart,
    suggestedEnd,
  };
}

function toDateOnly(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return "";
}

function toTimeOnly(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.slice(0, 5);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(11, 16);
  }

  return "";
}

async function hasTaskOverlap(db, { userId, taskId, date, start, end }) {
  const result = await db.query(
    `
      SELECT 1
      FROM tasks
      WHERE user_id = $1::uuid
        AND id <> $2::uuid
        AND date = $3::date
        AND status <> 'done'
        AND start_time < $5::time
        AND end_time > $4::time
      LIMIT 1
    `,
    [userId, taskId, date, start, end]
  );

  return result.rowCount > 0;
}

async function applyRescheduleChainAction(db, action) {
  const rawSuggestions = Array.isArray(action?.payload?.suggestions) ? action.payload.suggestions : [];
  const suggestions = rawSuggestions.map(normalizeRescheduleSuggestion).filter(Boolean);

  if (!suggestions.length) {
    return {
      ok: false,
      error: "Missing valid reschedule suggestions in action payload.",
    };
  }

  const applied = [];
  const skipped = [];

  for (const suggestion of suggestions) {
    const taskResult = await db.query(
      `
        SELECT id, title, status
        FROM tasks
        WHERE id = $1::uuid
          AND user_id = $2::uuid
        LIMIT 1
      `,
      [suggestion.taskId, action.userId]
    );

    if (!taskResult.rowCount) {
      skipped.push({
        task_id: suggestion.taskId,
        reason: "task_not_found",
      });
      continue;
    }

    const task = taskResult.rows[0];
    if (task.status === "done") {
      skipped.push({
        task_id: suggestion.taskId,
        reason: "task_already_done",
      });
      continue;
    }

    const overlap = await hasTaskOverlap(db, {
      userId: action.userId,
      taskId: suggestion.taskId,
      date: suggestion.suggestedDate,
      start: suggestion.suggestedStart,
      end: suggestion.suggestedEnd,
    });

    if (overlap) {
      skipped.push({
        task_id: suggestion.taskId,
        reason: "time_overlap",
      });
      continue;
    }

    const updateResult = await db.query(
      `
        UPDATE tasks
        SET
          date = $3::date,
          start_time = $4::time,
          end_time = $5::time,
          updated_at = NOW()
        WHERE id = $1::uuid
          AND user_id = $2::uuid
        RETURNING id, title, date, start_time, end_time
      `,
      [
        suggestion.taskId,
        action.userId,
        suggestion.suggestedDate,
        suggestion.suggestedStart,
        suggestion.suggestedEnd,
      ]
    );

    if (!updateResult.rowCount) {
      skipped.push({
        task_id: suggestion.taskId,
        reason: "update_failed",
      });
      continue;
    }

    const row = updateResult.rows[0];
    applied.push({
      task_id: row.id,
      title: row.title,
      date: toDateOnly(row.date),
      start: toTimeOnly(row.start_time),
      end: toTimeOnly(row.end_time),
    });
  }

  if (!applied.length) {
    return {
      ok: false,
      error: "Reschedule chain has no applicable task after validation.",
      details: {
        applied,
        skipped,
      },
    };
  }

  return {
    ok: true,
    details: {
      applied,
      skipped,
    },
  };
}

async function sendActionToChannel({ channel, connectionId, destination, action }) {
  if (channel === "telegram") {
    return sendTelegramReminder({
      connectionId,
      integrationId: "telegram",
      chatId: destination,
      text: `[Schedule Planner]\n${action.title}\n${action.summary}`,
    });
  }

  if (channel === "gmail") {
    return sendGmailReminder({
      connectionId,
      integrationId: "gmail",
      toEmail: destination,
      subject: `[Schedule Planner] ${action.title}`,
      textBody: action.summary,
      htmlBody: `<p>${action.summary.replace(/\n/g, "<br/>")}</p>`,
    });
  }

  throw new Error(`Unsupported proactive channel '${channel}'.`);
}

async function loadActionExecutionContext(db, action) {
  const userProfileResult = await db.query(
    `
      SELECT id, email
      FROM users
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [action.userId]
  );

  if (!userProfileResult.rowCount) {
    throw new Error("User profile not found for proactive action execution.");
  }

  await ensureDefaultNotificationChannelSettings(db, action.userId);

  const [settings, connections] = await Promise.all([
    listNotificationChannelSettingsByUser(db, action.userId),
    listIntegrationConnectionsByUser(db, action.userId),
  ]);

  const settingMap = new Map(settings.map((item) => [item.channel, item]));
  const connectionMap = new Map(connections.map((item) => [item.integrationId, item]));

  return {
    userEmail: userProfileResult.rows[0].email || "",
    channels: normalizeEnabledChannels(settings),
    settingMap,
    connectionMap,
  };
}

async function executePreparedAction(action, executionContext) {
  const errors = [];

  for (const channel of executionContext.channels) {
    const connection = executionContext.connectionMap.get(channel) || null;
    const setting = executionContext.settingMap.get(channel) || null;

    if (!connection || connection.status !== "active" || !connection.connectionId) {
      errors.push(`${channel}: missing active connection`);
      continue;
    }

    const destination = resolveDestination({
      channel,
      setting,
      userEmail: executionContext.userEmail,
    });
    if (!destination) {
      errors.push(`${channel}: missing destination`);
      continue;
    }

    try {
      const sendResult = await sendActionToChannel({
        channel,
        connectionId: connection.connectionId,
        destination,
        action,
      });

      return {
        ok: true,
        channel,
        deliveryProvider: DELIVERY_PROVIDER_BY_CHANNEL[channel] || `nango-${channel}`,
        externalMessageId: sendResult.externalMessageId || "",
      };
    } catch (error) {
      errors.push(`${channel}: ${summarizeSendError(error)}`);
    }
  }

  return {
    ok: false,
    error: errors.length ? errors.join("; ") : "No channel could deliver proactive action.",
  };
}

export async function createManagedAssistantAction(
  db,
  {
    userId,
    actionType,
    riskLevel = "low",
    title,
    summary,
    payload = null,
    dedupeKey = "",
    sourceWorkflow = "",
  }
) {
  await ensureDefaultAssistantPolicies(db, userId);
  const mode = await getAssistantPolicyMode(db, {
    userId,
    actionType,
  });

  const action = await createAssistantAction(db, {
    userId,
    actionType,
    riskLevel,
    mode,
    status: initialStatusByMode(mode),
    title,
    summary,
    payload,
    dedupeKey,
    sourceWorkflow,
  });

  return action;
}

export async function executeAssistantActionNow(actionId) {
  await ensureMigrations();

  const prepared = await withTransaction(async (db) => {
    const action = await getAssistantActionById(db, actionId);
    if (!action) {
      throw new Error("Assistant action not found.");
    }

    if (!["approved", "executing"].includes(action.status)) {
      return {
        skipped: true,
        action,
      };
    }

    const updatedAction = await updateAssistantActionStatus(db, {
      actionId: action.id,
      status: "executing",
    });

    if (action.actionType === "reschedule_chain") {
      return {
        skipped: false,
        action: updatedAction,
        executionType: "reschedule_chain",
      };
    }

    const context = await loadActionExecutionContext(db, action);

    return {
      skipped: false,
      action: updatedAction,
      context,
      executionType: "notify",
    };
  });

  if (prepared.skipped) {
    return prepared.action;
  }

  if (prepared.executionType === "reschedule_chain") {
    const executionResult = await withTransaction((db) => applyRescheduleChainAction(db, prepared.action));

    if (executionResult.ok) {
      return withTransaction(async (db) => {
        const updated = await updateAssistantActionStatus(db, {
          actionId: prepared.action.id,
          status: "executed",
          executedAt: new Date(),
          errorMessage: "",
        });

        return {
          ...updated,
          execution: executionResult.details,
        };
      });
    }

    return withTransaction(async (db) =>
      updateAssistantActionStatus(db, {
        actionId: prepared.action.id,
        status: "failed",
        errorMessage: executionResult.error,
      })
    );
  }

  const executionResult = await executePreparedAction(prepared.action, prepared.context);
  if (executionResult.ok) {
    return withTransaction(async (db) => {
      const updated = await updateAssistantActionStatus(db, {
        actionId: prepared.action.id,
        status: "executed",
        executedAt: new Date(),
        errorMessage: "",
      });
      return {
        ...updated,
        delivery: {
          channel: executionResult.channel,
          provider: executionResult.deliveryProvider,
          externalMessageId: executionResult.externalMessageId,
        },
      };
    });
  }

  return withTransaction(async (db) =>
    updateAssistantActionStatus(db, {
      actionId: prepared.action.id,
      status: "failed",
      errorMessage: executionResult.error,
    })
  );
}

export async function ensureUserHasIntegrationForAction(db, { userId, actionType }) {
  if (actionType === "reschedule_chain") {
    return true;
  }

  const channels = await ensureDefaultNotificationChannelSettings(db, userId).then(() =>
    listNotificationChannelSettingsByUser(db, userId)
  );

  for (const channel of normalizeEnabledChannels(channels)) {
    const connection = await getIntegrationConnectionByUser(db, userId, channel);
    if (connection && connection.status === "active") {
      return true;
    }
  }

  return false;
}
