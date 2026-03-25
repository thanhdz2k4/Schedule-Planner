import { getPatchFields, getRequiredEntities } from "@/lib/agent/router/intentRules";
import { hasValue } from "@/lib/agent/router/textUtils";

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function evaluateConfidence({ intent, topCandidate, entities }) {
  const requiredFields = getRequiredEntities(intent);
  const missing = requiredFields.filter((field) => !hasValue(entities[field]));
  const patchFields = getPatchFields(intent);

  if (patchFields.length > 0) {
    const hasAnyPatch = patchFields.some((field) => hasValue(entities[field]));
    if (!hasAnyPatch) {
      missing.push("patch");
    }
  }

  const matched = topCandidate?.matchCount || 0;
  const totalPatterns = Math.max(1, topCandidate?.patternCount || 1);
  const patternScore = matched / totalPatterns;

  const requiredFound = requiredFields.length - missing.filter((field) => field !== "patch").length;
  const requiredCoverage =
    requiredFields.length > 0 ? clamp(requiredFound / requiredFields.length) : 1;

  const rawEntityCount = Object.keys(entities).length;
  const genericEntityScore = clamp(rawEntityCount / 5);

  let confidence = 0.26;
  confidence += (topCandidate?.score || 0) * 0.42;
  confidence += patternScore * 0.14;
  confidence += requiredCoverage * 0.12;
  confidence += genericEntityScore * 0.1;
  confidence -= Math.min(0.35, missing.length * 0.12);

  if (missing.length === 0 && requiredFields.length > 0) {
    confidence = Math.max(confidence, 0.72);
  }

  return {
    confidence: clamp(confidence, 0.05, 0.99),
    missingFields: [...new Set(missing)],
  };
}
