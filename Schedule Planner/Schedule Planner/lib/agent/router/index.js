import { buildClarificationQuestion } from "@/lib/agent/router/clarify";
import { evaluateConfidence } from "@/lib/agent/router/confidence";
import { extractEntities } from "@/lib/agent/router/entityExtractors";
import { getPatchFields, getRequiredEntities, scoreIntentCandidates } from "@/lib/agent/router/intentRules";
import { isMistralConfigured, routeWithMistral } from "@/lib/agent/router/llmRouter";
import { hasValue, normalizeForMatch, pad2 } from "@/lib/agent/router/textUtils";

const EXECUTE_CONFIDENCE_THRESHOLD = 0.65;
const ALLOWED_INTENTS = new Set([
  "create_task",
  "update_task",
  "delete_task",
  "query_data",
  "set_goal",
  "plan_day",
  "plan_week",
  "detect_risk",
  "reschedule_chain",
  "configure_reminder",
  "connect_messenger",
]);

function normalizeProvider(rawProvider) {
  const value = typeof rawProvider === "string" ? rawProvider.trim().toLowerCase() : "";
  if (value === "mistral" || value === "auto" || value === "rule") {
    return value;
  }

  const envProvider =
    typeof process.env.ROUTER_PROVIDER === "string"
      ? process.env.ROUTER_PROVIDER.trim().toLowerCase()
      : "";
  if (envProvider === "mistral" || envProvider === "auto" || envProvider === "rule") {
    return envProvider;
  }

  return "rule";
}

function normalizeIntent(rawIntent) {
  return typeof rawIntent === "string" && ALLOWED_INTENTS.has(rawIntent) ? rawIntent : null;
}

function normalizeMemoryFacts(rawMemoryFacts) {
  if (!Array.isArray(rawMemoryFacts)) {
    return [];
  }

  return rawMemoryFacts
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const type = typeof item.type === "string" ? item.type.trim() : "";
      const key = typeof item.key === "string" ? item.key.trim() : "";
      const value = typeof item.value === "string" ? item.value.trim() : "";
      if (!type || !key || !value) {
        return null;
      }

      const confidence = Number(item.confidence);
      const normalizedConfidence = Number.isFinite(confidence)
        ? Math.max(0, Math.min(1, confidence))
        : 0.7;
      const source = typeof item.source === "string" && item.source.trim() ? item.source.trim() : "memory";

      return {
        type,
        key,
        value,
        confidence: normalizedConfidence,
        source,
      };
    })
    .filter(Boolean)
    .slice(0, 30);
}

function normalizeContext(rawContext) {
  if (!rawContext || typeof rawContext !== "object" || Array.isArray(rawContext)) {
    return {
      intent: null,
      entities: {},
      last_user_text: null,
      last_agent_question: null,
      memory_facts: [],
    };
  }

  const entities =
    rawContext.entities && typeof rawContext.entities === "object" && !Array.isArray(rawContext.entities)
      ? rawContext.entities
      : {};

  return {
    intent: normalizeIntent(rawContext.intent),
    entities,
    last_user_text:
      typeof rawContext.last_user_text === "string" ? rawContext.last_user_text.trim() : null,
    last_agent_question:
      typeof rawContext.last_agent_question === "string"
        ? rawContext.last_agent_question.trim()
        : null,
    memory_facts: normalizeMemoryFacts(rawContext.memory_facts),
  };
}

function toMinutes(hhmm) {
  if (typeof hhmm !== "string" || !/^\d{2}:\d{2}$/.test(hhmm)) {
    return null;
  }

  const [hours, minutes] = hhmm.split(":").map(Number);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

function fromMinutes(value) {
  const safe = Math.max(0, Math.min(23 * 60 + 59, value));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function applyDurationToEntities(entities) {
  const duration = Number.parseInt(entities?.duration_minutes, 10);
  const startMinutes = toMinutes(entities?.start);

  if (!Number.isInteger(duration) || duration <= 0 || startMinutes === null) {
    return entities;
  }

  const endMinutes = Math.min(23 * 60 + 59, startMinutes + duration);
  return {
    ...entities,
    duration_minutes: duration,
    end: fromMinutes(endMinutes),
  };
}

function normalizePriority(value) {
  const normalized = normalizeForMatch(typeof value === "string" ? value : "");
  if (!normalized) return value;

  if (["high", "cao", "uu tien cao", "khan cap", "gap"].some((token) => normalized.includes(token))) {
    return "high";
  }
  if (["medium", "trung binh", "vua"].some((token) => normalized.includes(token))) {
    return "medium";
  }
  if (["low", "thap", "khong gap"].some((token) => normalized.includes(token))) {
    return "low";
  }
  return value;
}

function normalizeStatus(value) {
  const normalized = normalizeForMatch(typeof value === "string" ? value : "");
  if (!normalized) return value;

  if (
    [
      "done",
      "hoan thanh",
      "xong",
      "xong roi",
      "da xong",
      "completed",
      "complete",
      "finished",
      "finish",
    ].some((token) => normalized.includes(token))
  ) {
    return "done";
  }
  if (
    ["doing", "dang lam", "in progress", "inprogress", "active", "dang xu ly"].some((token) =>
      normalized.includes(token)
    )
  ) {
    return "doing";
  }
  if (
    ["todo", "to do", "chua lam", "chua xong", "pending", "not done"].some((token) =>
      normalized.includes(token)
    )
  ) {
    return "todo";
  }
  return value;
}

function normalizeEntitiesForWorkflow(entities) {
  const normalized = { ...(entities || {}) };

  if (hasValue(normalized.priority)) {
    normalized.priority = normalizePriority(normalized.priority);
  }

  if (hasValue(normalized.status)) {
    normalized.status = normalizeStatus(normalized.status);
  }

  if (hasValue(normalized.duration_minutes)) {
    const duration = Number.parseInt(normalized.duration_minutes, 10);
    if (Number.isInteger(duration) && duration > 0) {
      normalized.duration_minutes = duration;
    } else {
      delete normalized.duration_minutes;
    }
  }

  if (hasValue(normalized.minutes_before)) {
    const minutesBefore = Number.parseInt(normalized.minutes_before, 10);
    if (Number.isInteger(minutesBefore) && minutesBefore >= 0) {
      normalized.minutes_before = minutesBefore;
    } else {
      delete normalized.minutes_before;
    }
  }

  return normalized;
}

function mergeEntitiesWithContext(currentEntities, contextEntities, intent) {
  const baseContextEntities =
    contextEntities && typeof contextEntities === "object" && !Array.isArray(contextEntities)
      ? { ...contextEntities }
      : {};

  // For update flow, do not carry stale time/date fields from previous turns.
  // Users often send short follow-ups like "task X da xong", which should only patch status.
  if (intent === "update_task") {
    delete baseContextEntities.date;
    delete baseContextEntities.start;
    delete baseContextEntities.end;
    delete baseContextEntities.duration_minutes;
  }

  const merged = {
    ...baseContextEntities,
    ...(currentEntities || {}),
  };
  return applyDurationToEntities(normalizeEntitiesForWorkflow(merged));
}

function looksLikeFollowUpPatch(text) {
  const normalized = normalizeForMatch(text);
  if (!normalized) return false;

  const hasPatchSignals =
    /\b(keo dai|thoi luong|duration|uu tien|nhac truoc|truoc \d+\s*phut|hoan thanh|xong|done|completed|finish|dang lam|chua lam|chua xong)\b/.test(
      normalized
    ) ||
    /\b\d+\s*(phut|gio|tieng)\b/.test(normalized);

  const hasStrongNewIntentSignals = /\b(tao task|them task|xoa task|delete task|muc tieu|set goal|plan)\b/.test(
    normalized
  );

  const hasQuerySignals = /\b(bao nhieu|liet ke|thong ke|tong|ty le)\b/.test(normalized);

  return hasPatchSignals && !hasStrongNewIntentSignals && !hasQuerySignals;
}

function looksLikeCreateScheduleCommand(text, entities = {}) {
  const normalized = normalizeForMatch(text);
  if (!normalized) {
    return false;
  }

  const hasCreateVerb = /\b(tao|them|add|dat|len|lap|schedule)\b/.test(normalized);
  const hasScheduleTarget = /\b(task|lich|meeting|cuoc hop|hen|appointment|su kien|viec)\b/.test(
    normalized
  );
  const hasTemporalHint =
    hasValue(entities?.date) ||
    hasValue(entities?.start) ||
    hasValue(entities?.end) ||
    /\b(hom nay|ngay mai|mai|thu\s*[2-8]|20\d{2}-\d{1,2}-\d{1,2}|\d{1,2}:\d{2}|\d{1,2}\s*(h|gio))\b/.test(
      normalized
    );

  if (!hasCreateVerb || !hasScheduleTarget || !hasTemporalHint) {
    return false;
  }

  if (/\b(plan day|plan week|ke hoach|tong quan|bao nhieu|thong ke|liet ke)\b/.test(normalized)) {
    return false;
  }

  return true;
}

function seemsMultiTaskCreateCommand(text, intent) {
  if (intent !== "create_task") {
    return false;
  }

  const normalized = normalizeForMatch(text);
  if (!normalized) {
    return false;
  }

  const hasConnector = /\b(va|and|sau do|roi)\b/.test(normalized);
  const startMarkers =
    normalized.match(/\b(?:luc|vao|tu)\s*\d{1,2}(?::\d{1,2})?(?:\s*(?:h|gio))?\b/g) || [];
  const explicitRanges =
    normalized.match(
      /\btu\s*\d{1,2}(?::\d{1,2})?(?:\s*(?:h|gio))?\s*(?:den|toi|-)\s*\d{1,2}(?::\d{1,2})?(?:\s*(?:h|gio))?\b/g
    ) || [];

  return hasConnector && (startMarkers.length >= 2 || explicitRanges.length >= 2);
}

function resolveMissingFields(intent, entities) {
  const missing = getRequiredEntities(intent).filter((field) => !hasValue(entities[field]));
  const patchFields = getPatchFields(intent);

  if (patchFields.length > 0) {
    const hasAnyPatch = patchFields.some((field) => hasValue(entities[field]));
    if (!hasAnyPatch) {
      missing.push("patch");
    }
  }

  return [...new Set(missing)];
}

function toContextForNextTurn(result, inputText, memoryFacts) {
  return {
    intent: result.intent,
    entities: result.entities,
    last_user_text: inputText,
    last_agent_question: result.need_clarification ? result.clarifying_question : null,
    memory_facts: Array.isArray(memoryFacts) ? memoryFacts : [],
  };
}

function finalizeRouterResult({ rawResult, source, context, inputText }) {
  let intent = normalizeIntent(rawResult?.intent) || "query_data";
  if (context.intent && intent === "query_data" && looksLikeFollowUpPatch(inputText)) {
    intent = context.intent;
  }

  const currentEntities =
    rawResult?.entities && typeof rawResult.entities === "object" && !Array.isArray(rawResult.entities)
      ? rawResult.entities
      : {};

  const taskHintEntities = {
    ...(context?.entities || {}),
    ...currentEntities,
  };

  if (
    ["plan_day", "plan_week", "query_data"].includes(intent) &&
    looksLikeCreateScheduleCommand(inputText, taskHintEntities)
  ) {
    intent = "create_task";
  }

  const entities = mergeEntitiesWithContext(currentEntities, context.entities, intent);

  const confidenceValue =
    typeof rawResult?.confidence === "number" && !Number.isNaN(rawResult.confidence)
      ? Math.max(0, Math.min(1, rawResult.confidence))
      : 0;

  const missingFields = resolveMissingFields(intent, entities);
  const followUpResolvedByContext =
    Boolean(context.intent) && looksLikeFollowUpPatch(inputText) && missingFields.length === 0;
  const multiTaskClarification = seemsMultiTaskCreateCommand(inputText, intent);
  const needClarification =
    multiTaskClarification ||
    missingFields.length > 0 ||
    (!followUpResolvedByContext && confidenceValue < EXECUTE_CONFIDENCE_THRESHOLD);

  const result = {
    intent,
    confidence: Number(confidenceValue.toFixed(2)),
    entities,
    need_clarification: needClarification,
    clarifying_question: needClarification
      ? multiTaskClarification
        ? "Hien tai moi lan chi tao 1 task. Ban muon tao task nao truoc?"
        : rawResult?.clarifying_question || buildClarificationQuestion({ intent, missingFields })
      : null,
    source,
  };

  return {
    ...result,
    context_for_next_turn: toContextForNextTurn(result, inputText, context.memory_facts),
  };
}

function routeUserTextByRules({
  text,
  now = new Date(),
  context = {
    intent: null,
    entities: {},
    last_user_text: null,
    last_agent_question: null,
    memory_facts: [],
  },
}) {
  const scoring = scoreIntentCandidates(text);
  const topCandidate = scoring.topCandidate;

  let intent = topCandidate.score > 0 ? topCandidate.intent : "query_data";
  if (context.intent && topCandidate.score < 0.45 && looksLikeFollowUpPatch(text)) {
    intent = context.intent;
  }

  const entities = extractEntities({ text, intent, now });

  const confidenceResult = evaluateConfidence({
    intent,
    topCandidate,
    entities,
  });

  return finalizeRouterResult({
    rawResult: {
      intent,
      confidence: confidenceResult.confidence,
      entities,
    },
    source: "rule",
    context,
    inputText: text,
  });
}

export async function routeUserText({ text, now = new Date(), provider, context: rawContext }) {
  const normalizedProvider = normalizeProvider(provider);
  const context = normalizeContext(rawContext);

  if ((normalizedProvider === "mistral" || normalizedProvider === "auto") && isMistralConfigured()) {
    try {
      const aiResult = await routeWithMistral({ text, now, context });
      if (aiResult) {
        return finalizeRouterResult({
          rawResult: aiResult,
          source: "mistral",
          context,
          inputText: text,
        });
      }
    } catch (error) {
      if (normalizedProvider === "mistral") {
        throw error;
      }
      console.warn("Mistral router failed, fallback to rule:", error?.message || error);
    }
  }

  const fallback = routeUserTextByRules({ text, now, context });
  if (normalizedProvider === "mistral" && !isMistralConfigured()) {
    return {
      ...fallback,
      warning:
        "MISTRAL_API_KEY chưa được cấu hình. Đang fallback sang rule-based router.",
    };
  }

  return fallback;
}

export { normalizeContext, routeUserTextByRules };
