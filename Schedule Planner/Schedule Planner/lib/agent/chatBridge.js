import { routeUserText } from "@/lib/agent/router";
import { executeWorkflow, listSupportedWorkflowIntents } from "@/lib/agent/workflow-engine";
import { loadUserMemoryContext, persistMemoryTurn } from "@/lib/agent/memory";
import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import { ensureUserExists } from "@/lib/db/users";

function toNonEmptyText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

const SUPPORTED_WORKFLOW_INTENTS = new Set(listSupportedWorkflowIntents());

function summarizeExecutionFailure(execution) {
  const message = toNonEmptyText(execution?.error?.message);
  if (message) {
    return `Minh chua the xu ly hanh dong nay: ${message}`;
  }

  return "Minh chua the xu ly yeu cau nay luc nay. Ban thu doi cach dien dat hoac gui lai nhe.";
}

function summarizeExecutionSuccess(execution) {
  const preferred = [
    execution?.result?.message,
    execution?.result?.summary,
    execution?.result?.reply,
  ];

  for (const item of preferred) {
    const text = toNonEmptyText(item);
    if (text) {
      return text;
    }
  }

  return "Da nhan yeu cau. Minh da xu ly xong.";
}

function summarizeClarification(routeResult) {
  const question = toNonEmptyText(routeResult?.clarifying_question);
  if (question) {
    return question;
  }

  return "Ban co the bo sung them thong tin de minh xu ly chinh xac hon khong?";
}

function summarizeUnsupportedIntent(intent) {
  const resolvedIntent = toNonEmptyText(intent) || "unknown";
  return `Yeu cau dang map toi intent "${resolvedIntent}" nhung workflow nay chua duoc bat. Ban thu yeu cau tao/sua/xoa task hoac hoi lich hom nay nhe.`;
}

async function resolveMemoryContext(userId) {
  try {
    await ensureMigrations();
    return await withTransaction(async (db) => {
      await ensureUserExists(db, userId);
      return loadUserMemoryContext(db, {
        userId,
        limit: 60,
      });
    });
  } catch (error) {
    console.error("resolveMemoryContext failed:", error);
    return {
      facts: [],
      routerMemoryFacts: [],
      entityDefaults: {},
      memorySummary: "",
    };
  }
}

function mergeContextWithMemory(context, memoryContext) {
  const baseContext =
    context && typeof context === "object" && !Array.isArray(context) ? context : {};
  const existingEntities =
    baseContext.entities && typeof baseContext.entities === "object" && !Array.isArray(baseContext.entities)
      ? baseContext.entities
      : {};

  return {
    ...baseContext,
    entities: {
      ...(memoryContext.entityDefaults || {}),
      ...existingEntities,
    },
    memory_facts: Array.isArray(memoryContext.routerMemoryFacts)
      ? memoryContext.routerMemoryFacts
      : [],
  };
}

async function persistMemoryForTurn({
  userId,
  text,
  routeResult,
  stage,
  execution,
}) {
  try {
    await ensureMigrations();
    await withTransaction(async (db) => {
      await ensureUserExists(db, userId);
      await persistMemoryTurn(db, {
        userId,
        text,
        routeResult,
        execution: {
          ok: execution?.ok ?? false,
          stage,
        },
        source: "agent_turn",
      });
    });
  } catch (error) {
    console.error("persistMemoryForTurn failed:", error);
  }
}

export async function runAgentLabTurn({ userId, text, context = null, provider = "auto" }) {
  const memoryContext = await resolveMemoryContext(userId);
  const enrichedContext = mergeContextWithMemory(context, memoryContext);

  let routeResult = null;
  let output;

  try {
    routeResult = await routeUserText({
      text,
      provider,
      context: enrichedContext,
    });
  } catch {
    output = {
      ok: false,
      stage: "routing",
      routeResult: null,
      execution: null,
      replyText: "Minh chua route duoc yeu cau luc nay. Ban gui lai bang cau ngan gon hon nhe.",
      nextContext: enrichedContext,
    };
    await persistMemoryForTurn({
      userId,
      text,
      routeResult: null,
      stage: output.stage,
      execution: { ok: false },
    });
    return output;
  }

  if (routeResult.need_clarification) {
    output = {
      ok: true,
      stage: "routing",
      routeResult,
      execution: null,
      replyText: summarizeClarification(routeResult),
      nextContext: routeResult.context_for_next_turn || null,
    };
    await persistMemoryForTurn({
      userId,
      text,
      routeResult,
      stage: output.stage,
      execution: { ok: true },
    });
    return output;
  }

  if (!SUPPORTED_WORKFLOW_INTENTS.has(routeResult.intent)) {
    output = {
      ok: false,
      stage: "routing",
      routeResult,
      execution: null,
      replyText: summarizeUnsupportedIntent(routeResult.intent),
      nextContext: routeResult.context_for_next_turn || null,
    };
    await persistMemoryForTurn({
      userId,
      text,
      routeResult,
      stage: output.stage,
      execution: { ok: false },
    });
    return output;
  }

  let execution;
  try {
    execution = await executeWorkflow({
      userId,
      intent: routeResult.intent,
      entities: routeResult.entities,
      text,
    });
  } catch {
    output = {
      ok: false,
      stage: "workflow",
      routeResult,
      execution: null,
      replyText: "Workflow dang gap loi he thong tam thoi. Ban thu lai sau vai giay nhe.",
      nextContext: routeResult.context_for_next_turn || null,
    };
    await persistMemoryForTurn({
      userId,
      text,
      routeResult,
      stage: output.stage,
      execution: { ok: false },
    });
    return output;
  }

  if (!execution.ok) {
    output = {
      ok: false,
      stage: "workflow",
      routeResult,
      execution,
      replyText: summarizeExecutionFailure(execution),
      nextContext: routeResult.context_for_next_turn || null,
    };
    await persistMemoryForTurn({
      userId,
      text,
      routeResult,
      stage: output.stage,
      execution,
    });
    return output;
  }

  output = {
    ok: true,
    stage: "workflow",
    routeResult,
    execution,
    replyText: summarizeExecutionSuccess(execution),
    nextContext: routeResult.context_for_next_turn || null,
  };

  await persistMemoryForTurn({
    userId,
    text,
    routeResult,
    stage: output.stage,
    execution,
  });

  return output;
}
