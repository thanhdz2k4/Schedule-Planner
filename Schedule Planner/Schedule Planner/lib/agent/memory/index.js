import {
  insertMemoryEvent,
  listUserMemoryFacts,
  upsertUserMemoryFact,
} from "@/lib/db/queries/userMemoryQueries";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeForKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .slice(0, 80);
}

function dedupeFacts(facts) {
  const map = new Map();
  for (const fact of facts) {
    const type = normalizeText(fact?.factType);
    const key = normalizeText(fact?.factKey);
    const value = normalizeText(fact?.factValue);
    if (!type || !key || !value) {
      continue;
    }

    const confidence = Number.isFinite(Number(fact?.confidence))
      ? Math.max(0, Math.min(1, Number(fact.confidence)))
      : 0.6;
    const source = normalizeText(fact?.source) || "chat";
    const mapKey = `${type}::${key}`;
    const previous = map.get(mapKey);
    if (!previous || confidence >= previous.confidence) {
      map.set(mapKey, {
        factType: type,
        factKey: key,
        factValue: value,
        confidence,
        source,
      });
    }
  }

  return Array.from(map.values());
}

function extractFocusWindowFromText(text) {
  const normalized = text.toLowerCase();
  if (!normalized) {
    return "";
  }

  if (/(buoi sang|sang som|morning)/i.test(normalized)) {
    return "morning";
  }
  if (/(buoi chieu|afternoon)/i.test(normalized)) {
    return "afternoon";
  }
  if (/(buoi toi|toi muon|evening|night)/i.test(normalized)) {
    return "evening";
  }

  return "";
}

function extractFactsFromUserText(text) {
  const input = normalizeText(text);
  if (!input) {
    return [];
  }

  const facts = [];

  const nameMatch = input.match(/\b(?:toi|m(i|ì)nh)\s+t(e|ê)n\s+l(a|à)\s+([^\.,!\n]+)/i);
  if (nameMatch) {
    const nameRaw = normalizeText(nameMatch[4]);
    const name = normalizeText(nameRaw.split(/\s+(va|và|nhung|nhưng|roi|rồi)\s+/i)[0]);
    if (name) {
      facts.push({
        factType: "profile",
        factKey: "display_name",
        factValue: name,
        confidence: 0.92,
        source: "chat",
      });
    }
  }

  const likeMatch = input.match(/\b(?:toi|m(i|ì)nh)\s+th(i|í)ch\s+([^\.,!\n]+)/i);
  if (likeMatch) {
    const topic = normalizeText(likeMatch[3]);
    const slug = normalizeForKey(topic);
    if (topic && slug) {
      facts.push({
        factType: "preference",
        factKey: `likes_${slug}`,
        factValue: topic,
        confidence: 0.83,
        source: "chat",
      });
    }
  }

  const dislikeMatch = input.match(/\b(?:toi|m(i|ì)nh)\s+kh(o|ô)ng\s+th(i|í)ch\s+([^\.,!\n]+)/i);
  if (dislikeMatch) {
    const topic = normalizeText(dislikeMatch[4]);
    const slug = normalizeForKey(topic);
    if (topic && slug) {
      facts.push({
        factType: "preference",
        factKey: `dislikes_${slug}`,
        factValue: topic,
        confidence: 0.83,
        source: "chat",
      });
    }
  }

  if (/(toi|m(i|ì)nh).*(h(o|ọ)c|l(a|à)m vi(e|ệ)c).*(t(o|ố)t|hi(e|ệ)u qu(a|ả)|h(ơ|ơ)n)/i.test(input)) {
    const window = extractFocusWindowFromText(input);
    if (window) {
      facts.push({
        factType: "habit",
        factKey: "focus_window",
        factValue: window,
        confidence: 0.8,
        source: "chat",
      });
    }
  }

  return facts;
}

function extractFactsFromRoute(routeResult) {
  if (!routeResult || typeof routeResult !== "object") {
    return [];
  }

  const entities =
    routeResult.entities && typeof routeResult.entities === "object" && !Array.isArray(routeResult.entities)
      ? routeResult.entities
      : {};
  const facts = [];

  const priority = normalizeText(entities.priority).toLowerCase();
  if (priority === "high" || priority === "medium" || priority === "low") {
    facts.push({
      factType: "preference",
      factKey: "default_priority",
      factValue: priority,
      confidence: 0.68,
      source: "workflow",
    });
  }

  const minutesBefore = Number.parseInt(entities.minutes_before, 10);
  if (Number.isInteger(minutesBefore) && minutesBefore >= 0 && minutesBefore <= 240) {
    facts.push({
      factType: "preference",
      factKey: "default_reminder_minutes",
      factValue: `${minutesBefore}`,
      confidence: 0.7,
      source: "workflow",
    });
  }

  return facts;
}

function inferEntityDefaults(memoryFacts) {
  const defaults = {};

  for (const fact of memoryFacts) {
    if (fact.factType === "preference" && fact.factKey === "default_priority") {
      const priority = normalizeText(fact.factValue).toLowerCase();
      if (priority === "high" || priority === "medium" || priority === "low") {
        defaults.priority = priority;
      }
    }

    if (fact.factType === "preference" && fact.factKey === "default_reminder_minutes") {
      const minutes = Number.parseInt(fact.factValue, 10);
      if (Number.isInteger(minutes) && minutes >= 0) {
        defaults.minutes_before = minutes;
      }
    }
  }

  return defaults;
}

function summarizeMemoryFacts(memoryFacts) {
  const lines = memoryFacts.slice(0, 12).map((fact) => {
    const confidence = Math.round((Number(fact.confidence) || 0) * 100);
    return `- ${fact.factType}.${fact.factKey}: ${fact.factValue} (${confidence}%)`;
  });
  return lines.join("\n");
}

function toRouterMemoryFacts(memoryFacts) {
  return memoryFacts.slice(0, 30).map((fact) => ({
    type: fact.factType,
    key: fact.factKey,
    value: fact.factValue,
    confidence: Number(fact.confidence) || 0,
    source: fact.source || "chat",
  }));
}

export async function loadUserMemoryContext(db, { userId, limit = 50 }) {
  const memoryFacts = await listUserMemoryFacts(db, {
    userId,
    limit,
  });

  return {
    facts: memoryFacts,
    routerMemoryFacts: toRouterMemoryFacts(memoryFacts),
    entityDefaults: inferEntityDefaults(memoryFacts),
    memorySummary: summarizeMemoryFacts(memoryFacts),
  };
}

export function extractMemoryFactsFromTurn({ text, routeResult }) {
  return dedupeFacts([
    ...extractFactsFromUserText(text),
    ...extractFactsFromRoute(routeResult),
  ]);
}

export async function persistMemoryTurn(
  db,
  { userId, text, routeResult, execution, source = "chat_turn" }
) {
  const extracted = extractMemoryFactsFromTurn({
    text,
    routeResult,
  });

  for (const fact of extracted) {
    await upsertUserMemoryFact(db, {
      userId,
      factType: fact.factType,
      factKey: fact.factKey,
      factValue: fact.factValue,
      confidence: fact.confidence,
      source: fact.source,
    });
  }

  await insertMemoryEvent(db, {
    userId,
    eventType: source,
    payload: {
      text: normalizeText(text).slice(0, 300),
      intent: normalizeText(routeResult?.intent),
      stage: normalizeText(execution?.stage || ""),
      execution_ok: Boolean(execution?.ok),
      extracted_count: extracted.length,
      extracted_preview: extracted.slice(0, 10).map((item) => ({
        fact_type: item.factType,
        fact_key: item.factKey,
        fact_value: item.factValue,
        confidence: item.confidence,
      })),
    },
  });

  return extracted;
}
