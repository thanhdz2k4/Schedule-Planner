import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import { getIntegrationConnectionByUser } from "@/lib/db/queries/integrationConnectionQueries";
import { GmailSendError, sendGmailReminder } from "@/lib/integrations/gmailSender";
import { buildReminderEmailContent } from "@/lib/reminder/formatter";
import { DEFAULT_INTEGRATION_ID } from "@/lib/reminder/scheduler";
import { getNextRetryAt, shouldRetryReminder } from "@/lib/reminder/retryPolicy";

const DEFAULT_BATCH_SIZE = 20;
const DELIVERY_PROVIDER = "nango-gmail";

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
  if (error instanceof GmailSendError) {
    return {
      code: error.code || "GMAIL_SEND_ERROR",
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

async function insertDeliveryLog(db, {
  job,
  attemptNo,
  connectionId = "",
  isSuccess,
  requestPayload = null,
  responsePayload = null,
  errorCode = "",
  errorMessage = "",
  durationMs = null,
}) {
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
      job.integrationId,
      DELIVERY_PROVIDER,
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

async function markReminderAsSent(db, { job, connectionId, externalMessageId }) {
  await db.query(
    `
      UPDATE reminder_jobs
      SET status = 'sent',
          sent_at = NOW(),
          connection_id = $2,
          delivery_provider = $3,
          external_message_id = $4,
          last_error = NULL,
          updated_at = NOW()
      WHERE id = $1::uuid
    `,
    [job.id, connectionId, DELIVERY_PROVIDER, externalMessageId || null]
  );
}

async function markReminderAsRetry(db, { job, connectionId, nextSendAt, errorMessage }) {
  await db.query(
    `
      UPDATE reminder_jobs
      SET status = 'pending',
          retry_count = retry_count + 1,
          send_at = $2::timestamptz,
          connection_id = $3,
          delivery_provider = $4,
          last_error = $5,
          updated_at = NOW()
      WHERE id = $1::uuid
    `,
    [job.id, nextSendAt.toISOString(), connectionId || null, DELIVERY_PROVIDER, errorMessage]
  );
}

async function markReminderAsFailed(db, { job, connectionId, errorMessage }) {
  await db.query(
    `
      UPDATE reminder_jobs
      SET status = 'failed',
          retry_count = retry_count + 1,
          connection_id = $2,
          delivery_provider = $3,
          last_error = $4,
          updated_at = NOW()
      WHERE id = $1::uuid
    `,
    [job.id, connectionId || null, DELIVERY_PROVIDER, errorMessage]
  );
}

async function handleUnsupportedIntegration(db, job, nowMs) {
  const message = `Unsupported integration '${job.integrationId}' for reminder worker.`;
  await markReminderAsFailed(db, {
    job,
    connectionId: "",
    errorMessage: message,
  });

  await insertDeliveryLog(db, {
    job,
    attemptNo: job.retryCount + 1,
    connectionId: "",
    isSuccess: false,
    requestPayload: {
      integrationId: job.integrationId,
    },
    responsePayload: null,
    errorCode: "UNSUPPORTED_INTEGRATION",
    errorMessage: message,
    durationMs: Date.now() - nowMs,
  });

  return {
    jobId: job.id,
    status: "failed",
    reason: message,
  };
}

async function processReminderJob(db, job) {
  const startedAt = Date.now();

  if (job.task.status === "done") {
    const reason = "Task already done before reminder dispatch.";
    await markReminderAsCanceled(db, { job, reason });

    await insertDeliveryLog(db, {
      job,
      attemptNo: job.retryCount + 1,
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

  if (job.integrationId !== DEFAULT_INTEGRATION_ID) {
    return handleUnsupportedIntegration(db, job, startedAt);
  }

  const connection = await getIntegrationConnectionByUser(db, job.userId, DEFAULT_INTEGRATION_ID);
  if (!connection || connection.status !== "active" || !connection.connectionId) {
    const reason = "No active Gmail connection for this user.";

    await markReminderAsFailed(db, {
      job,
      connectionId: connection?.connectionId || "",
      errorMessage: reason,
    });

    await insertDeliveryLog(db, {
      job,
      attemptNo: job.retryCount + 1,
      connectionId: connection?.connectionId || "",
      isSuccess: false,
      requestPayload: {
        integrationId: DEFAULT_INTEGRATION_ID,
      },
      responsePayload: null,
      errorCode: "MISSING_CONNECTION",
      errorMessage: reason,
      durationMs: Date.now() - startedAt,
    });

    return {
      jobId: job.id,
      status: "failed",
      reason,
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

  const requestSnapshot = {
    toEmail: job.user.email,
    subject: content.subject,
    integrationId: DEFAULT_INTEGRATION_ID,
  };

  try {
    const sendResult = await sendGmailReminder({
      connectionId: connection.connectionId,
      integrationId: DEFAULT_INTEGRATION_ID,
      toEmail: job.user.email,
      subject: content.subject,
      textBody: content.textBody,
      htmlBody: content.htmlBody,
    });

    await markReminderAsSent(db, {
      job,
      connectionId: connection.connectionId,
      externalMessageId: sendResult.externalMessageId,
    });

    await insertDeliveryLog(db, {
      job,
      attemptNo: job.retryCount + 1,
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
      messageId: sendResult.externalMessageId || "",
    };
  } catch (error) {
    const normalizedError = summarizeError(error);
    const willRetry = shouldRetryReminder({
      retryCount: job.retryCount,
      retryableError: normalizedError.retryable,
    });

    if (willRetry) {
      const nextRetryAt = getNextRetryAt({ retryCount: job.retryCount, now: new Date() });
      await markReminderAsRetry(db, {
        job,
        connectionId: connection.connectionId,
        nextSendAt: nextRetryAt,
        errorMessage: normalizedError.message,
      });

      await insertDeliveryLog(db, {
        job,
        attemptNo: job.retryCount + 1,
        connectionId: connection.connectionId,
        isSuccess: false,
        requestPayload: requestSnapshot,
        responsePayload: normalizedError.raw,
        errorCode: normalizedError.code,
        errorMessage: normalizedError.message,
        durationMs: Date.now() - startedAt,
      });

      return {
        jobId: job.id,
        status: "retry_scheduled",
        errorCode: normalizedError.code,
        nextRetryAt: nextRetryAt.toISOString(),
      };
    }

    await markReminderAsFailed(db, {
      job,
      connectionId: connection.connectionId,
      errorMessage: normalizedError.message,
    });

    await insertDeliveryLog(db, {
      job,
      attemptNo: job.retryCount + 1,
      connectionId: connection.connectionId,
      isSuccess: false,
      requestPayload: requestSnapshot,
      responsePayload: normalizedError.raw,
      errorCode: normalizedError.code,
      errorMessage: normalizedError.message,
      durationMs: Date.now() - startedAt,
    });

    return {
      jobId: job.id,
      status: "failed",
      errorCode: normalizedError.code,
      reason: normalizedError.message,
    };
  }
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
