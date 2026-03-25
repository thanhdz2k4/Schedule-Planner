import { BusinessError, normalizeWorkflowError } from "@/lib/agent/workflow-engine/errors";
import { getWorkflowByIntent, listSupportedWorkflowIntents } from "@/lib/agent/workflow-engine/registry";
import { getPool, withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import { ensureUserExists, resolveUserId } from "@/lib/db/users";

function normalizeEntities(rawEntities) {
  if (!rawEntities || typeof rawEntities !== "object" || Array.isArray(rawEntities)) {
    return {};
  }
  return rawEntities;
}

async function createStartedRun({ userId, intent, text, entities }) {
  await withTransaction(async (db) => {
    await ensureUserExists(db, userId);
  });

  const pool = getPool();
  const result = await pool.query(
    `
      INSERT INTO agent_runs (user_id, intent, input_text, output_json, status, run_type)
      VALUES ($1::uuid, $2, $3, $4::jsonb, 'started', 'workflow')
      RETURNING id
    `,
    [
      userId,
      intent,
      text || "",
      JSON.stringify({
        intent,
        entities,
      }),
    ]
  );

  return result.rows[0]?.id || null;
}

async function finalizeRun({
  runId,
  status,
  output,
  errorMessage,
  durationMs,
  stepLogs,
}) {
  if (!runId) {
    return;
  }

  const pool = getPool();
  await pool.query(
    `
      UPDATE agent_runs
      SET status = $2,
          output_json = $3::jsonb,
          error_message = $4,
          duration_ms = $5,
          step_logs = $6::jsonb
      WHERE id = $1::uuid
    `,
    [runId, status, JSON.stringify(output), errorMessage || null, durationMs, JSON.stringify(stepLogs || [])]
  );
}

async function executeStep({ context, step, stepLogs }) {
  const startedAt = Date.now();
  const startedAtISO = new Date(startedAt).toISOString();
  const logEntry = {
    step: step.name,
    status: "running",
    started_at: startedAtISO,
  };
  stepLogs.push(logEntry);

  try {
    const meta = await step.run(context);
    const finishedAt = Date.now();
    logEntry.status = "success";
    logEntry.finished_at = new Date(finishedAt).toISOString();
    logEntry.duration_ms = finishedAt - startedAt;
    if (meta !== undefined) {
      logEntry.meta = meta;
    }
  } catch (error) {
    const finishedAt = Date.now();
    const normalized = normalizeWorkflowError(error);
    logEntry.status = "failed";
    logEntry.finished_at = new Date(finishedAt).toISOString();
    logEntry.duration_ms = finishedAt - startedAt;
    logEntry.error = normalized;
    throw error;
  }
}

function assertIntentSupported(intent) {
  const workflow = getWorkflowByIntent(intent);
  if (!workflow) {
    throw new BusinessError("Intent is not supported by workflow engine.", {
      code: "UNSUPPORTED_WORKFLOW_INTENT",
      status: 400,
      details: {
        intent,
        supported_intents: listSupportedWorkflowIntents(),
      },
    });
  }
  return workflow;
}

export async function executeWorkflow({ userId: rawUserId, intent, entities: rawEntities, text }) {
  await ensureMigrations();

  const userId = resolveUserId(rawUserId);
  const entities = normalizeEntities(rawEntities);
  const workflow = assertIntentSupported(intent);
  const startedAt = Date.now();
  const stepLogs = [];

  const runId = await createStartedRun({
    userId,
    intent,
    text,
    entities,
  });

  try {
    const context = {
      db: null,
      userId,
      intent,
      text: typeof text === "string" ? text : "",
      entities,
      now: new Date(),
      state: {},
      result: null,
    };

    const result = await withTransaction(async (db) => {
      context.db = db;
      await ensureUserExists(db, userId);

      for (const step of workflow) {
        await executeStep({
          context,
          step,
          stepLogs,
        });
      }

      return context.result;
    });

    const durationMs = Date.now() - startedAt;
    const payload = {
      ok: true,
      intent,
      result,
      logs: stepLogs,
      run_id: runId,
      duration_ms: durationMs,
    };

    await finalizeRun({
      runId,
      status: "success",
      output: payload,
      errorMessage: null,
      durationMs,
      stepLogs,
    });

    return payload;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const normalized = normalizeWorkflowError(error);
    const payload = {
      ok: false,
      intent,
      result: null,
      logs: stepLogs,
      error: normalized,
      run_id: runId,
      duration_ms: durationMs,
    };

    await finalizeRun({
      runId,
      status: "failed",
      output: payload,
      errorMessage: normalized.message,
      durationMs,
      stepLogs,
    });

    return payload;
  }
}

export { listSupportedWorkflowIntents };
