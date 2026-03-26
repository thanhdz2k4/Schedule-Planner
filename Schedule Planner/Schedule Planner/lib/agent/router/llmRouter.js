import { buildClarificationQuestion } from "@/lib/agent/router/clarify";
import { getPatchFields, getRequiredEntities } from "@/lib/agent/router/intentRules";
import { hasValue } from "@/lib/agent/router/textUtils";

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

function normalizeConfidence(value, fallback = 0.5) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  if (value > 1 && value <= 100) {
    return Math.max(0, Math.min(1, value / 100));
  }

  return Math.max(0, Math.min(1, value));
}

function extractJsonFromContent(content) {
  if (typeof content !== "string") {
    return null;
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const bracketMatch = candidate.match(/\{[\s\S]*\}/);
    if (!bracketMatch) {
      return null;
    }

    try {
      return JSON.parse(bracketMatch[0]);
    } catch {
      return null;
    }
  }
}

function extractMessageText(responsePayload) {
  const message = responsePayload?.choices?.[0]?.message;
  const content = message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.type === "text" && typeof item?.text === "string") return item.text;
        return "";
      })
      .join("\n");
  }

  return "";
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

function normalizeLlmRouterResult(payload) {
  const rawIntent = typeof payload?.intent === "string" ? payload.intent : "";
  const intent = ALLOWED_INTENTS.has(rawIntent) ? rawIntent : "query_data";
  const entities =
    payload?.entities && typeof payload.entities === "object" && !Array.isArray(payload.entities)
      ? payload.entities
      : {};
  const confidence = normalizeConfidence(payload?.confidence, 0.6);
  const missingFields = resolveMissingFields(intent, entities);

  const needClarification =
    Boolean(payload?.need_clarification) || confidence < 0.65 || missingFields.length > 0;

  const clarifyingQuestion =
    needClarification
      ? typeof payload?.clarifying_question === "string" && payload.clarifying_question.trim()
        ? payload.clarifying_question.trim()
        : buildClarificationQuestion({ intent, missingFields })
      : null;

  return {
    intent,
    confidence: Number(confidence.toFixed(2)),
    entities,
    need_clarification: needClarification,
    clarifying_question: clarifyingQuestion,
    source: "mistral",
  };
}

function buildSystemPrompt(todayISO) {
  return [
    "You are the intern-router for the Schedule Planner application.",
    "Task: classify intent and extract entities from the user's message.",
    "Today is " + todayISO + ".",
    "Return plain JSON only, no markdown.",
    "Required schema:",
    "{",
    '  "intent": "create_task|update_task|delete_task|query_data|set_goal|plan_day|plan_week|detect_risk|reschedule_chain|configure_reminder|connect_messenger",',
    '  "confidence": 0.0-1.0,',
    '  "entities": { ... },',
    '  "need_clarification": true|false,',
    '  "clarifying_question": "string|null"',
    "}",
    "If required data is missing for execution, set need_clarification=true and ask a short question in Vietnamese.",
    "Prioritize entities: title, date(YYYY-MM-DD), start(HH:mm), end(HH:mm), duration_minutes, priority, status, target, deadline, minutes_before.",
    "If the user is sending a follow-up reply, reuse previous-turn context to fill missing entities.",
    "If memory_facts are available, treat them as user preferences and constraints. Do not hallucinate facts not present in memory_facts.",
  ].join("\n");
}

function buildContextPrompt(context) {
  if (!context || typeof context !== "object") {
    return null;
  }

  const memoryFacts = Array.isArray(context.memory_facts)
    ? context.memory_facts
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
          return {
            type,
            key,
            value,
            confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.7,
            source: typeof item.source === "string" ? item.source.trim() : "memory",
          };
        })
        .filter(Boolean)
        .slice(0, 20)
    : [];

  const payload = {
    intent: typeof context.intent === "string" ? context.intent : null,
    entities:
      context.entities && typeof context.entities === "object" && !Array.isArray(context.entities)
        ? context.entities
        : {},
    last_user_text:
      typeof context.last_user_text === "string" ? context.last_user_text : null,
    last_agent_question:
      typeof context.last_agent_question === "string" ? context.last_agent_question : null,
    memory_facts: memoryFacts,
  };

  if (!payload.intent && !Object.keys(payload.entities).length && !payload.memory_facts.length) {
    return null;
  }

  return `Context turn truoc:\n${JSON.stringify(payload, null, 2)}`;
}

function resolveTimeoutMs() {
  const value = Number.parseInt(process.env.MISTRAL_TIMEOUT_MS || "", 10);
  if (!Number.isInteger(value) || value < 2000) {
    return 15000;
  }
  return value;
}

export function isMistralConfigured() {
  return Boolean(process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY.trim());
}

export async function routeWithMistral({ text, now = new Date(), context }) {
  const apiKey = process.env.MISTRAL_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const endpoint = (process.env.MISTRAL_API_URL || "https://api.mistral.ai/v1/chat/completions").trim();
  const model = (process.env.MISTRAL_MODEL || "mistral-large-latest").trim();
  const todayISO = now.toISOString().slice(0, 10);
  const contextPrompt = buildContextPrompt(context);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resolveTimeoutMs());

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          { role: "system", content: buildSystemPrompt(todayISO) },
          ...(contextPrompt ? [{ role: "system", content: contextPrompt }] : []),
          { role: "user", content: text },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Mistral API ${response.status}: ${errorText.slice(0, 400)}`);
    }

    const payload = await response.json();
    const content = extractMessageText(payload);
    const json = extractJsonFromContent(content);
    if (!json) {
      throw new Error("Mistral response khong co JSON hop le.");
    }

    return normalizeLlmRouterResult(json);
  } finally {
    clearTimeout(timeout);
  }
}
