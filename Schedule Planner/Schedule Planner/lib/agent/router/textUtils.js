export function normalizeForMatch(text) {
  if (typeof text !== "string") {
    return "";
  }

  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9:\/\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactObject(input) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

export function hasValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

export function pad2(value) {
  return String(value).padStart(2, "0");
}
