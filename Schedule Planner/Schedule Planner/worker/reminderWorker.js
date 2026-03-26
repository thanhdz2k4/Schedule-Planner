import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import { listIntegrationConnectionsByUser } from "@/lib/db/queries/integrationConnectionQueries";
import {
  ensureDefaultNotificationChannelSettings,
  listNotificationChannelSettingsByUser,
} from "@/lib/db/queries/notificationChannelSettingQueries";
import { GmailSendError, sendGmailReminder } from "@/lib/integrations/gmailSender";
import { sendTelegramReminder, TelegramSendError } from "@/lib/integrations/telegramSender";
import { buildReminderEmailContent } from "@/lib/reminder/formatter";
import { DEFAULT_INTEGRATION_ID } from "@/lib/reminder/scheduler";
import { getNextRetryAt, shouldRetryReminder } from "@/lib/reminder/retryPolicy";

const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_CHANNEL_ORDER = ["telegram", "gmail"];
const SUPPORTED_CHANNELS = new Set(DEFAULT_CHANNEL_ORDER);

const DELIVERY_PROVIDER_BY_CHANNEL = {
  gmail: "nango-gmail",
  telegram: "nango-telegram",
};

function normalizeBatchLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_BATCH_SIZE;
  }

  return Math.min(parsed, 200);
}

function toDateString(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  return "";
}

function toTimeString(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(11, 16);
  }

  if (typeof value === "string") {
    return value.slice(0, 5);
  }

  return "";
}

function mapReminderJobRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    taskId: row.task_id,
    integrationId: row.integration_id || DEFAULT_INTEGRATION_ID,
    sendAt: row.send_at,
    retryCount: Number.isInteger(row.retry_count) ? row.retry_count : Number.parseInt(row.retry_count, 10) || 0,
    leadMinutes: Number.isInteger(row.lead_minutes) ? row.lead_minutes : Number.parseInt(row.lead_minutes, 10) || 5,
    task: {
      title: row.task_title,
      date: toDateString(row.task_date),
      start: toTimeString(row.task_start_time),
      end: toTimeString(row.task_end_time),
      priority: row.task_priority,
      status: row.task_status,
    },
    user: {
      email: row.user_email,
      timezone: row.user_timezone,
    },
  };
}

function summarizeError(error) {
  if (error instanceof GmailSendError || error instanceof TelegramSendError) {
    return {
      code: error.code || "SEND_ERROR",
      message: error.message,
      retryable: Boolean(error.retryable),
      status: error.status || 0,
      raw: error.raw || null,
    };
  }

  if (error instanceof Error) {
    return {
      code: "UNEXPECTED_ERROR",
      message: error.message,
      retryable: true,
      status: 0,
      raw: null,
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: "Unknown reminder worker error.",
    retryable: true,
    status: 0,
    raw: null,
  };
}

function normalizeEnabledChannels(settings) {
  const enabled = settings
    .filter((setting) => setting.isEnabled && SUPPORTED_CHANNELS.has(setting.channel))
    .sort((a, b) => a.priorityOrder - b.priorityOrder)
    .map((setting) => setting.channel);

  return enabled.length ? enabled : [...DEFAULT_CHANNEL_ORDER];
}

function resolveChannelDestination({ channel, setting, userEmail }) {
  if (channel === "gmail") {
    const destination = typeof setting?.destination === "string" ? setting.destination.trim() : "";
    return destination || userEmail || "";
  }

  if (channel === "telegram") {
    const destination = typeof setting?.destination === "string" ? setting.destination.trim() : "";
    const fallback = typeof process.env.TELEGRAM_DEFAULT_CHAT_ID === "string" ? process.env.TELEGRAM_DEFAULT_CHAT_ID.trim() : "";
    return destination || fallback;
  }

  return "";
}

function buildChannelRequestSnapshot({ channel, destination, content }) {
  if (channel === "gmail") {
    return {
      channel,
      toEmail: destination,
      subject: content.subject,
    };
  }

  if (channel === "telegram") {
    return {
      channel,
      chatId: destination,
      text: content.textBody,
    };
  }

  return { channel };
}

async function sendViaChannel({ channel, connectionId, destination, content }) {
  if (channel === "gmail") {
    return sendGmailReminder({
      connectionId,
      integrationId: "gmail",
      toEmail: destination,
      subject: content.subject,
      textBody: content.textBody,
      htmlBody: content.htmlBody,
    });
  }

  if (channel === "telegram") {
    return sendTelegramReminder({
      connectionId,
      integrationId: "telegram",
      chatId: destination,
      text: content.textBody,
    });
  }

  throw new Error(`Unsupported channel '${channel}'.`);
}

async function loadLockedJobs(db, { userId = null, dueBefore, limit, includeFuture = false }) {
  const result = await db.query(
    `
      SELECT
        r.id,
        r.user_id,
        r.task_id,
        r.integration_id,
        r.send_at,
        r.retry_count,
        r.lead_minutes,
        t.title AS task_title,
        t.date AS task_date,
        t.start_time AS task_start_time,
        t.end_time AS task_end_time,
        t.priority AS task_priority,
        t.status AS task_status,
        u.email AS user_email,
        u.timezone AS user_timezone
      FROM reminder_jobs r
      INNER JOIN tasks t ON t.id = r.task_id
      INNER JOIN users u ON u.id = r.user_id
      WHERE r.status = 'pending'
        AND ($1::boolean OR r.send_at <= $2::timestamptz)
        AND ($3::uuid IS NULL OR r.user_id = $3::uuid)
      ORDER BY r.send_at ASC
      LIMIT $4
      FOR UPDATE SKIP LOCKED
    `,
    [includeFuture, dueBefore.toISOString(), userId, limit]
  );

  return result.rows.map(mapReminderJobRow);
}

async function loadUserDispatchContext(db, userId) {
  await ensureDefaultNotificationChannelSettings(db, userId);

  const [settings, connections] = await Promise.all([
    listNotificationChannelSettingsByUser(db, userId),
    listIntegrationConnectionsByUser(db, userId),
  ]);

  const settingMap = new Map(settings.map((item) => [item.channel, item]));
  const connectionMap = new Map(connections.map((item) => [item.integrationId, item]));

  return {
    settings,
    settingMap,
    connectionMap,
  };
}

async function insertDeliveryLog(
  db,
  {
    job,
    integrationId,
    deliveryProvider,
    attemptNo,
    connectionId = "",
    isSuccess,
    requestPayload = null,
    responsePayload = null,
    errorCode = "",
    errorMessage = "",
    durationMs = null,
  }
) {
  await db.query(
    `
      INSERT INTO reminder_deliveries (
        reminder_job_id,
        user_id,
        integration_id,
        delivery_provider,
        connection_id,
        attempt_no,
        is_success,
        request_payload,
        response_payload,
        error_code,
        error_message,
        duration_ms
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8::jsonb,
        $9::jsonb,
        $10,
        $11,
        $12
      )
    `,
    [
      job.id,
      job.userId,
      integrationId,
      deliveryProvider,
      connectionId || null,
      attemptNo,
      isSuccess,
      requestPayload ? JSON.stringify(requestPayload) : null,
      responsePayload ? JSON.stringify(responsePayload) : null,
      errorCode || null,
      errorMessage || null,
      Number.isInteger(durationMs) && durationMs >= 0 ? durationMs : null,
    ]
  );
}

async function markReminderAsCanceled(db, { job, reason }) {
  await db.query(
    `
      UPDATE reminder_jobs
      SET status = 'canceled',
          last_error = $2,
          updated_at = NOW()
      WHERE id = $1::uuid
    `,
    [job.id, reason]
  );
}

async function markReminderAsSent(db, { job, integrationId, connectionId, deliveryProvider, externalMessageId }) {
  await db.query(
    `
      UPDATE reminder_jobs
      SET integration_id = $2,
          status = 'sent',
          sent_at = NOW(),
          connection_id = $3,
          delivery_provider = $4,
          external_message_id = $5,
          last_error = NULL,
          updated_at = NOW()
      WHERE id = $1::uuid
    `,
    [job.id, integrationId, connectionId, deliveryProvider, externalMessageId || null]
  );
}

async function markReminderAsRetry(db, { job, integrationId, connectionId, deliveryProvider, nextSendAt, errorMessage }) {
  await db.query(
    `
      UPDATE reminder_jobs
      SET integration_id = $2,
          status = 'pending',
          retry_count = retry_count + 1,
          send_at = $3::timestamptz,
          connection_id = $4,
          delivery_provider = $5,
          last_error = $6,
          updated_at = NOW()
      WHERE id = $1::uuid
    `,
    [job.id, integrationId, nextSendAt.toISOString(), connectionId || null, deliveryProvider, errorMessage]
  );
}

async function markReminderAsFailed(db, { job, integrationId, connectionId, deliveryProvider, errorMessage }) {
  await db.query(
    `
      UPDATE reminder_jobs
      SET integration_id = $2,
          status = 'failed',
          retry_count = retry_count + 1,
          connection_id = $3,
          delivery_provider = $4,
          last_error = $5,
          updated_at = NOW()
      WHERE id = $1::uuid
    `,
    [job.id, integrationId, connectionId || null, deliveryProvider, errorMessage]
  );
}

async function processReminderJob(db, job) {
  const startedAt = Date.now();
  const attemptNo = job.retryCount + 1;

  if (job.task.status === "done") {
    const reason = "Task already done before reminder dispatch.";
    await markReminderAsCanceled(db, { job, reason });

    await insertDeliveryLog(db, {
      job,
      integrationId: job.integrationId,
      deliveryProvider: "nango-reminder",
      attemptNo,
      connectionId: "",
      isSuccess: false,
      requestPayload: {
        taskId: job.taskId,
      },
      responsePayload: null,
      errorCode: "TASK_DONE",
      errorMessage: reason,
      durationMs: Date.now() - startedAt,
    });

    return {
      jobId: job.id,
      status: "canceled",
      reason,
    };
  }

  const context = await loadUserDispatchContext(db, job.userId);
  const channels = normalizeEnabledChannels(context.settings);
  if (!channels.length) {
    const reason = "No enabled notification channels.";
    await markReminderAsFailed(db, {
      job,
      integrationId: job.integrationId,
      connectionId: "",
      deliveryProvider: "nango-reminder",
      errorMessage: reason,
    });

    await insertDeliveryLog(db, {
      job,
      integrationId: job.integrationId,
      deliveryProvider: "nango-reminder",
      attemptNo,
      connectionId: "",
      isSuccess: false,
      requestPayload: null,
      responsePayload: null,
      errorCode: "NO_ENABLED_CHANNELS",
      errorMessage: reason,
      durationMs: Date.now() - startedAt,
    });

    return {
      jobId: job.id,
      status: "failed",
      reason,
      errorCode: "NO_ENABLED_CHANNELS",
    };
  }

  const content = buildReminderEmailContent({
    taskTitle: job.task.title,
    date: job.task.date,
    start: job.task.start,
    end: job.task.end,
    priority: job.task.priority,
    timezone: job.user.timezone,
    leadMinutes: job.leadMinutes,
  });

  const hardFailures = [];

  for (const channel of channels) {
    const deliveryProvider = DELIVERY_PROVIDER_BY_CHANNEL[channel] || `nango-${channel}`;
    const connection = context.connectionMap.get(channel) || null;
    const setting = context.settingMap.get(channel) || null;

    if (!connection || connection.status !== "active" || !connection.connectionId) {
      const reason = `No active ${channel} connection for this user.`;
      hardFailures.push({ channel, reason, errorCode: "MISSING_CONNECTION" });

      await insertDeliveryLog(db, {
        job,
        integrationId: channel,
        deliveryProvider,
        attemptNo,
        connectionId: connection?.connectionId || "",
        isSuccess: false,
        requestPayload: { channel },
        responsePayload: null,
        errorCode: "MISSING_CONNECTION",
        errorMessage: reason,
        durationMs: Date.now() - startedAt,
      });
      continue;
    }

    const destination = resolveChannelDestination({
      channel,
      setting,
      userEmail: job.user.email,
    });

    if (!destination) {
      const reason =
        channel === "telegram"
          ? "Missing Telegram destination chat id in channel settings."
          : "Missing destination for notification channel.";
      hardFailures.push({ channel, reason, errorCode: "MISSING_DESTINATION" });

      await insertDeliveryLog(db, {
        job,
        integrationId: channel,
        deliveryProvider,
        attemptNo,
        connectionId: connection.connectionId,
        isSuccess: false,
        requestPayload: { channel },
        responsePayload: null,
        errorCode: "MISSING_DESTINATION",
        errorMessage: reason,
        durationMs: Date.now() - startedAt,
      });
      continue;
    }

    const requestSnapshot = buildChannelRequestSnapshot({
      channel,
      destination,
      content,
    });

    try {
      const sendResult = await sendViaChannel({
        channel,
        connectionId: connection.connectionId,
        destination,
        content,
      });

      await markReminderAsSent(db, {
        job,
        integrationId: channel,
        connectionId: connection.connectionId,
        deliveryProvider,
        externalMessageId: sendResult.externalMessageId,
      });

      await insertDeliveryLog(db, {
        job,
        integrationId: channel,
        deliveryProvider,
        attemptNo,
        connectionId: connection.connectionId,
        isSuccess: true,
        requestPayload: requestSnapshot,
        responsePayload: sendResult.response || null,
        errorCode: "",
        errorMessage: "",
        durationMs: Date.now() - startedAt,
      });

      return {
        jobId: job.id,
        status: "sent",
        channel,
        messageId: sendResult.externalMessageId || "",
      };
    } catch (error) {
      const normalizedError = summarizeError(error);
      const canRetry = shouldRetryReminder({
        retryCount: job.retryCount,
        retryableError: normalizedError.retryable,
      });

      await insertDeliveryLog(db, {
        job,
        integrationId: channel,
        deliveryProvider,
        attemptNo,
        connectionId: connection.connectionId,
        isSuccess: false,
        requestPayload: requestSnapshot,
        responsePayload: normalizedError.raw,
        errorCode: normalizedError.code,
        errorMessage: normalizedError.message,
        durationMs: Date.now() - startedAt,
      });

      if (canRetry) {
        const nextRetryAt = getNextRetryAt({ retryCount: job.retryCount, now: new Date() });
        await markReminderAsRetry(db, {
          job,
          integrationId: channel,
          connectionId: connection.connectionId,
          deliveryProvider,
          nextSendAt: nextRetryAt,
          errorMessage: normalizedError.message,
        });

        return {
          jobId: job.id,
          status: "retry_scheduled",
          channel,
          errorCode: normalizedError.code,
          nextRetryAt: nextRetryAt.toISOString(),
        };
      }

      hardFailures.push({
        channel,
        reason: normalizedError.message,
        errorCode: normalizedError.code || "SEND_ERROR",
      });
    }
  }

  const finalFailure = hardFailures[hardFailures.length - 1] || {
    channel: job.integrationId,
    reason: "No channel could deliver this reminder.",
    errorCode: "NO_CHANNEL_DELIVERED",
  };

  await markReminderAsFailed(db, {
    job,
    integrationId: finalFailure.channel,
    connectionId: "",
    deliveryProvider: DELIVERY_PROVIDER_BY_CHANNEL[finalFailure.channel] || "nango-reminder",
    errorMessage: finalFailure.reason,
  });

  return {
    jobId: job.id,
    status: "failed",
    channel: finalFailure.channel,
    reason: finalFailure.reason,
    errorCode: finalFailure.errorCode,
  };
}

export async function dispatchReminderJobs({ userId = null, limit = DEFAULT_BATCH_SIZE, includeFuture = false } = {}) {
  await ensureMigrations();

  const normalizedLimit = normalizeBatchLimit(limit);
  const dueBefore = new Date();

  const details = await withTransaction(async (db) => {
    const lockedJobs = await loadLockedJobs(db, {
      userId,
      dueBefore,
      limit: normalizedLimit,
      includeFuture,
    });

    const dispatchResults = [];
    for (const job of lockedJobs) {
      const result = await processReminderJob(db, job);
      dispatchResults.push(result);
    }

    return dispatchResults;
  });

  const summary = {
    scanned: details.length,
    sent: details.filter((item) => item.status === "sent").length,
    retried: details.filter((item) => item.status === "retry_scheduled").length,
    failed: details.filter((item) => item.status === "failed").length,
    canceled: details.filter((item) => item.status === "canceled").length,
  };

  return {
    summary,
    details,
  };
}
