import { normalizeForMatch } from "@/lib/agent/router/textUtils";

export const INTENT_RULES = [
  {
    intent: "connect_messenger",
    base: 0.45,
    weight: 0.5,
    patterns: [
      /\bket noi messenger\b/,
      /\bconnect messenger\b/,
      /\blien ket messenger\b/,
      /\boauth messenger\b/,
      /\bwebhook messenger\b/,
    ],
    requiredEntities: [],
  },
  {
    intent: "configure_reminder",
    base: 0.36,
    weight: 0.54,
    patterns: [
      /\bcau hinh nhac\b/,
      /\bconfigure reminder\b/,
      /\bdoi nhac truoc\b/,
      /\btat nhac\b/,
      /\bbat nhac\b/,
      /\bchi nhac\b/,
      /\breminder\b/,
    ],
    requiredEntities: [],
  },
  {
    intent: "set_goal",
    base: 0.36,
    weight: 0.56,
    patterns: [
      /\bmuc tieu\b/,
      /\bset goal\b/,
      /\bgoal\b/,
      /\btarget\b/,
      /\bchi tieu\b/,
    ],
    requiredEntities: ["title", "target"],
  },
  {
    intent: "plan_day",
    base: 0.34,
    weight: 0.56,
    patterns: [
      /\blen ke hoach\b/,
      /\bsap lich\b/,
      /\bxep lich\b/,
      /\bplan day\b/,
      /\bplan hom nay\b/,
      /\btoi uu lich\b/,
    ],
    requiredEntities: [],
  },
  {
    intent: "plan_week",
    base: 0.34,
    weight: 0.56,
    patterns: [
      /\bplan week\b/,
      /\bke hoach tuan\b/,
      /\blen lich tuan\b/,
      /\btuan nay nen lam gi\b/,
      /\btong quan tuan\b/,
    ],
    requiredEntities: [],
  },
  {
    intent: "detect_risk",
    base: 0.34,
    weight: 0.56,
    patterns: [
      /\bdetect risk\b/,
      /\bkiem tra rui ro\b/,
      /\brui ro lich\b/,
      /\bxung dot lich\b/,
      /\boverdue\b/,
      /\btre han\b/,
    ],
    requiredEntities: [],
  },
  {
    intent: "reschedule_chain",
    base: 0.34,
    weight: 0.56,
    patterns: [
      /\breschedule\b/,
      /\bdoi lich hang loat\b/,
      /\bdoi lich day chuyen\b/,
      /\bday lui lich\b/,
      /\bchuyen cac task tre han\b/,
    ],
    requiredEntities: [],
  },
  {
    intent: "delete_task",
    base: 0.36,
    weight: 0.56,
    patterns: [
      /\bxoa task\b/,
      /\bdelete task\b/,
      /\bhuy task\b/,
      /\bbo task\b/,
      /\bxoa viec\b/,
    ],
    requiredEntities: ["title"],
  },
  {
    intent: "update_task",
    base: 0.34,
    weight: 0.56,
    patterns: [
      /\bcap nhat task\b/,
      /\bsua task\b/,
      /\bdoi task\b/,
      /\bdoi gio\b/,
      /\bchuyen task\b/,
      /\bdanh dau task\b/,
      /\bupdate task\b/,
    ],
    requiredEntities: ["title"],
    atLeastOnePatch: ["date", "start", "end", "priority", "status"],
  },
  {
    intent: "create_task",
    base: 0.34,
    weight: 0.56,
    patterns: [
      /\btao task\b/,
      /\bthem task\b/,
      /\badd task\b/,
      /\bdat lich\b/,
      /\btao lich\b/,
      /\bthem lich\b/,
      /\blen lich\b/,
      /\bschedule\b/,
      /\btao viec\b/,
      /\bnhac toi\b/,
    ],
    requiredEntities: ["title", "date", "start", "end"],
  },
  {
    intent: "query_data",
    base: 0.32,
    weight: 0.56,
    patterns: [
      /\bbao nhieu\b/,
      /\btask nao\b/,
      /\btong\b/,
      /\bliet ke\b/,
      /\bthong ke\b/,
      /\bcon bao nhieu\b/,
      /\bty le\b/,
      /\bhom nay toi\b/,
      /\bthis week\b/,
    ],
    requiredEntities: [],
  },
];

const RULE_MAP = new Map(INTENT_RULES.map((rule) => [rule.intent, rule]));

export function getRuleByIntent(intent) {
  return RULE_MAP.get(intent) || null;
}

export function getRequiredEntities(intent) {
  return getRuleByIntent(intent)?.requiredEntities || [];
}

export function getPatchFields(intent) {
  return getRuleByIntent(intent)?.atLeastOnePatch || [];
}

export function scoreIntentCandidates(text) {
  const normalizedText = normalizeForMatch(text);
  const boostByIntent = new Map();

  const addBoost = (intent, value) => {
    boostByIntent.set(intent, (boostByIntent.get(intent) || 0) + value);
  };

  if (/\bmessenger\b/.test(normalizedText)) {
    addBoost("connect_messenger", 0.36);
  }

  if (/\b(muc tieu|goal|target|chi tieu)\b/.test(normalizedText)) {
    addBoost("set_goal", 0.3);
  }

  if (/\b(len ke hoach|sap lich|xep lich|plan)\b/.test(normalizedText)) {
    addBoost("plan_day", 0.28);
  }

  if (
    /\b(tao|them|add|dat|len|lap|schedule)\b/.test(normalizedText) &&
    /\b(task|lich|meeting|cuoc hop|hen|appointment|su kien|viec)\b/.test(normalizedText) &&
    /\b(\d{1,2}:\d{2}|\d{1,2}\s*(h|gio)|hom nay|ngay mai|mai|20\d{2}-\d{1,2}-\d{1,2})\b/.test(
      normalizedText
    )
  ) {
    addBoost("create_task", 0.42);
  }

  if (/\b(tuan|week)\b/.test(normalizedText) && /\b(plan|ke hoach|tong quan)\b/.test(normalizedText)) {
    addBoost("plan_week", 0.32);
  }

  if (/\b(rui ro|risk|xung dot|tre han|overdue)\b/.test(normalizedText)) {
    addBoost("detect_risk", 0.34);
  }

  if (/\b(reschedule|doi lich|day lui|day chuyen)\b/.test(normalizedText)) {
    addBoost("reschedule_chain", 0.36);
  }

  if (/\b(cau hinh|reminder|thong bao)\b/.test(normalizedText)) {
    addBoost("configure_reminder", 0.24);
  }

  if (/\b(bao nhieu|liet ke|thong ke|tong|ty le)\b/.test(normalizedText)) {
    addBoost("query_data", 0.28);
  }

  if (/\btask\b/.test(normalizedText)) {
    if (/\b(xoa|delete|huy|bo)\b/.test(normalizedText)) {
      addBoost("delete_task", 0.34);
    }

    if (/\b(sua|doi|cap nhat|update|danh dau|chuyen)\b/.test(normalizedText)) {
      addBoost("update_task", 0.34);
    }

    if (
      /\b(tao|them|add|dat|len|nhac)\b/.test(normalizedText) ||
      /\b(\d{1,2}:\d{2}|\d{1,2}h)\b/.test(normalizedText) ||
      /\b(20\d{2}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}(?:\/20\d{2})?)\b/.test(normalizedText)
    ) {
      addBoost("create_task", 0.28);
    }
  }

  const candidates = INTENT_RULES.map((rule) => {
    const matchCount = rule.patterns.reduce((count, pattern) => {
      return pattern.test(normalizedText) ? count + 1 : count;
    }, 0);

    const baseScore =
      matchCount > 0
        ? Math.min(1, rule.base + (matchCount / Math.max(1, rule.patterns.length)) * rule.weight)
        : 0;
    const boost = boostByIntent.get(rule.intent) || 0;
    const score = Math.min(1, baseScore + boost);

    return {
      intent: rule.intent,
      score,
      matchCount,
      patternCount: rule.patterns.length,
    };
  }).sort((a, b) => b.score - a.score);

  return {
    normalizedText,
    candidates,
    topCandidate: candidates[0] || {
      intent: "query_data",
      score: 0,
      matchCount: 0,
      patternCount: 0,
    },
  };
}
