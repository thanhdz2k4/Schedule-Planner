import { routeUserText } from "@/lib/agent/router";
import { executeWorkflow, listSupportedWorkflowIntents } from "@/lib/agent/workflow-engine";

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

export async function runAgentLabTurn({ userId, text, context = null, provider = "auto" }) {
  let routeResult;
  try {
    routeResult = await routeUserText({
      text,
      provider,
      context,
    });
  } catch {
    return {
      ok: false,
      stage: "routing",
      routeResult: null,
      execution: null,
      replyText: "Minh chua route duoc yeu cau luc nay. Ban gui lai bang cau ngan gon hon nhe.",
      nextContext: context,
    };
  }

  if (routeResult.need_clarification) {
    return {
      ok: true,
      stage: "routing",
      routeResult,
      execution: null,
      replyText: summarizeClarification(routeResult),
      nextContext: routeResult.context_for_next_turn || null,
    };
  }

  if (!SUPPORTED_WORKFLOW_INTENTS.has(routeResult.intent)) {
    return {
      ok: false,
      stage: "routing",
      routeResult,
      execution: null,
      replyText: summarizeUnsupportedIntent(routeResult.intent),
      nextContext: routeResult.context_for_next_turn || null,
    };
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
    return {
      ok: false,
      stage: "workflow",
      routeResult,
      execution: null,
      replyText: "Workflow dang gap loi he thong tam thoi. Ban thu lai sau vai giay nhe.",
      nextContext: routeResult.context_for_next_turn || null,
    };
  }

  if (!execution.ok) {
    return {
      ok: false,
      stage: "workflow",
      routeResult,
      execution,
      replyText: summarizeExecutionFailure(execution),
      nextContext: routeResult.context_for_next_turn || null,
    };
  }

  return {
    ok: true,
    stage: "workflow",
    routeResult,
    execution,
    replyText: summarizeExecutionSuccess(execution),
    nextContext: routeResult.context_for_next_turn || null,
  };
}
