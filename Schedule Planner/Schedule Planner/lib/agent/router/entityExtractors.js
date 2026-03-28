import { compactObject, normalizeForMatch, pad2 } from "@/lib/agent/router/textUtils";

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(baseDate, days) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + days);
  return date;
}

function asValidDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function extractWeekdayDate(normalizedText, now) {
  const weekdayMatch = normalizedText.match(/\bthu\s*([2-8])\b/);
  if (!weekdayMatch) {
    return null;
  }

  const weekdayNumber = Number.parseInt(weekdayMatch[1], 10);
  const targetDay = weekdayNumber === 8 ? 0 : weekdayNumber - 1;
  const today = new Date(now);
  const currentDay = today.getDay();

  let diff = targetDay - currentDay;
  if (diff < 0) {
    diff += 7;
  }

  return toISODate(addDays(today, diff));
}

function extractDateValue(normalizedText, now) {
  if (/\bhom nay\b/.test(normalizedText)) {
    return toISODate(now);
  }

  if (/\b(ngay mai|mai)\b/.test(normalizedText)) {
    return toISODate(addDays(now, 1));
  }

  if (/\b(ngay kia|mot)\b/.test(normalizedText)) {
    return toISODate(addDays(now, 2));
  }

  const isoMatch = normalizedText.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const year = Number.parseInt(isoMatch[1], 10);
    const month = Number.parseInt(isoMatch[2], 10);
    const day = Number.parseInt(isoMatch[3], 10);
    const date = asValidDate(year, month, day);
    if (date) {
      return toISODate(date);
    }
  }

  const slashMatch = normalizedText.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
  if (slashMatch) {
    const day = Number.parseInt(slashMatch[1], 10);
    const month = Number.parseInt(slashMatch[2], 10);
    const year = slashMatch[3] ? Number.parseInt(slashMatch[3], 10) : now.getFullYear();
    const date = asValidDate(year, month, day);
    if (date) {
      return toISODate(date);
    }
  }

  return extractWeekdayDate(normalizedText, now);
}

function parseTimeParts(hourText, minuteText, normalizedText) {
  const hour = Number.parseInt(hourText, 10);
  const minute = minuteText === undefined ? 0 : Number.parseInt(minuteText, 10);

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null;
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  let normalizedHour = hour;
  if (hour <= 12 && /\b(chieu|toi)\b/.test(normalizedText) && hour < 12) {
    normalizedHour = hour + 12;
  }

  if (/\bsang\b/.test(normalizedText) && hour === 12) {
    normalizedHour = 0;
  }

  return `${pad2(normalizedHour)}:${pad2(minute)}`;
}

function toMinutes(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

function fromMinutes(value) {
  const safe = Math.max(0, Math.min(23 * 60 + 59, value));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function normalizeTimeRange(start, end) {
  if (!start || !end) {
    return { start: start || null, end: end || null };
  }

  const startMinutes = toMinutes(start);
  let endMinutes = toMinutes(end);
  if (endMinutes <= startMinutes) {
    endMinutes = Math.min(startMinutes + 60, 23 * 60 + 59);
  }

  return {
    start: fromMinutes(startMinutes),
    end: fromMinutes(endMinutes),
  };
}

function extractTimeRange(normalizedText) {
  const endByPhrase = normalizedText.match(
    /\bluc\s*(\d{1,2})(?:[:h](\d{1,2}))?\s*(?:gio)?\s*(?:ket thuc|xong luc|xong|den|toi|-)\s*(\d{1,2})(?:[:h](\d{1,2}))?\s*(?:gio)?\b/
  );

  if (endByPhrase) {
    const start = parseTimeParts(endByPhrase[1], endByPhrase[2], normalizedText);
    const end = parseTimeParts(endByPhrase[3], endByPhrase[4], normalizedText);
    return normalizeTimeRange(start, end);
  }

  const rangeMatch = normalizedText.match(
    /\btu\s*(\d{1,2})(?:[:h](\d{1,2}))?\s*(?:gio)?\s*(?:den|toi|-)\s*(\d{1,2})(?:[:h](\d{1,2}))?\s*(?:gio)?\b/
  );

  if (rangeMatch) {
    const start = parseTimeParts(rangeMatch[1], rangeMatch[2], normalizedText);
    const end = parseTimeParts(rangeMatch[3], rangeMatch[4], normalizedText);
    return normalizeTimeRange(start, end);
  }

  const compactRangeMatch = normalizedText.match(
    /\b(\d{1,2}):(\d{2})\s*(?:den|toi|-)\s*(\d{1,2}):(\d{2})\b/
  );

  if (compactRangeMatch) {
    const start = parseTimeParts(compactRangeMatch[1], compactRangeMatch[2], normalizedText);
    const end = parseTimeParts(compactRangeMatch[3], compactRangeMatch[4], normalizedText);
    return normalizeTimeRange(start, end);
  }

  const oneHourRange = normalizedText.match(/\b(\d{1,2})h\s*(?:den|toi|-)\s*(\d{1,2})h\b/);
  if (oneHourRange) {
    const start = parseTimeParts(oneHourRange[1], "0", normalizedText);
    const end = parseTimeParts(oneHourRange[2], "0", normalizedText);
    return normalizeTimeRange(start, end);
  }

  return { start: null, end: null };
}

function extractSingleTime(normalizedText) {
  const markerMatch = normalizedText.match(/\b(?:luc|vao|at)\s*(\d{1,2})(?:[:h](\d{1,2}))?\s*(?:gio)?\b/);
  if (markerMatch) {
    return parseTimeParts(markerMatch[1], markerMatch[2], normalizedText);
  }

  const hourWord = normalizedText.match(/\b(\d{1,2})\s*gio\b/);
  if (hourWord) {
    return parseTimeParts(hourWord[1], "0", normalizedText);
  }

  const genericMatch = normalizedText.match(/\b(\d{1,2})h\b/);
  if (genericMatch) {
    return parseTimeParts(genericMatch[1], "0", normalizedText);
  }

  return null;
}

function extractPriority(normalizedText) {
  if (/\b(uu tien cao|khan cap|quan trong|gap|high priority)\b/.test(normalizedText)) {
    return "high";
  }

  if (/\b(uu tien thap|khong gap|low priority)\b/.test(normalizedText)) {
    return "low";
  }

  if (/\b(uu tien trung binh|medium priority)\b/.test(normalizedText)) {
    return "medium";
  }

  return null;
}

function extractStatus(normalizedText) {
  if (/\b(chua hoan thanh|chua xong|chua lam)\b/.test(normalizedText)) {
    return "todo";
  }

  if (/\b(hoan thanh|xong|xong roi|da xong|done|completed|complete|finished|finish)\b/.test(normalizedText)) {
    return "done";
  }

  if (/\b(dang lam|dang xu ly|in progress|inprogress|doing|active)\b/.test(normalizedText)) {
    return "doing";
  }

  if (/\b(todo)\b/.test(normalizedText)) {
    return "todo";
  }

  return null;
}

function extractReminderOffset(normalizedText) {
  const beforeMatch = normalizedText.match(/\b(?:truoc|before)\s*(\d{1,3})\s*phut\b/);
  if (beforeMatch) {
    return Number.parseInt(beforeMatch[1], 10);
  }

  const reverseMatch = normalizedText.match(/\b(\d{1,3})\s*phut\s*(?:truoc|before)\b/);
  if (reverseMatch) {
    return Number.parseInt(reverseMatch[1], 10);
  }

  return null;
}

function extractDurationMinutes(normalizedText) {
  const hourAndHalf = normalizedText.match(
    /\b(?:keo dai|thoi luong|duration|trong)\s*(\d{1,2})\s*(?:gio|tieng)\s*ruoi\b/
  );
  if (hourAndHalf) {
    const hours = Number.parseInt(hourAndHalf[1], 10);
    if (Number.isInteger(hours) && hours > 0) {
      return hours * 60 + 30;
    }
  }

  const explicit = normalizedText.match(
    /\b(?:keo dai|thoi luong|duration|trong)\s*(\d{1,3})\s*(phut|gio|tieng|h)\b/
  );
  if (!explicit) {
    return null;
  }

  const amount = Number.parseInt(explicit[1], 10);
  if (!Number.isInteger(amount) || amount <= 0) {
    return null;
  }

  const unit = explicit[2];
  if (unit === "phut") {
    return amount;
  }

  return amount * 60;
}

function extractGoalTarget(normalizedText) {
  const explicitTarget = normalizedText.match(/\b(?:target|muc tieu)\s*(?:la)?\s*(\d{1,3})\b/);
  if (explicitTarget) {
    return Number.parseInt(explicitTarget[1], 10);
  }

  const countTasks = normalizedText.match(/\b(\d{1,3})\s*(?:task|viec|buoi|lan)\b/);
  if (countTasks) {
    return Number.parseInt(countTasks[1], 10);
  }

  return null;
}

function extractRescheduleCount(normalizedText) {
  const match = normalizedText.match(/\b(?:top|toi da|max|maximum|count)?\s*(\d{1,2})\s*(?:task|viec)\b/);
  if (!match) {
    return null;
  }

  const value = Number.parseInt(match[1], 10);
  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }

  return Math.min(value, 10);
}

function cleanupTitle(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const cleaned = value
    .replace(/[,.!?;]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || null;
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return cleanupTitle(match[1]);
    }
  }

  return null;
}

function extractTitle(text, intent) {
  const patternsByIntent = {
    create_task: [
      /(?:t?o|tao|thêm|them|add|d?t|dat|lên|len)\s+task\s+(.+?)(?=\s(?:lúc|luc|vào|vao|t?|tu|ngày|ngay|mai|hôm nay|hom nay|uu tiên|uu tien|deadline|tru?c|truoc)\b|$)/iu,
      /(?:nh?c tôi|nhac toi)\s+(.+?)(?=\s(?:lúc|luc|vào|vao|t?|tu|ngày|ngay|mai|hôm nay|hom nay|tru?c|truoc)\b|$)/iu,
      /task\s+(.+?)(?=\s(?:lúc|luc|vào|vao|t?|tu|ngày|ngay|mai|hôm nay|hom nay|uu tiên|uu tien|deadline|tru?c|truoc)\b|$)/iu,
      /(?:t?o|tao|thêm|them|add|d?t|dat|lên|len|l?p|lap)\s+(?:l?ch|lich|schedule)\s+(.+?)(?=\s(?:lúc|luc|vào|vao|t?|tu|ngày|ngay|mai|hôm nay|hom nay|uu tiên|uu tien|deadline|tru?c|truoc)\b|$)/iu,
      /(?:tôi|toi|minh|em)\s+có\s+(.+?)(?=\s(?:lúc|luc|vào|vao|t?|tu|ngày|ngay|mai|hôm nay|hom nay|uu tiên|uu tien|deadline|tru?c|truoc)\b|$)/iu,
    ],
    update_task: [
      /(?:s?a|sua|c?p nh?t|cap nhat|d?i|doi|chuy?n|chuyen|dánh d?u|danh dau)\s+task\s+(.+?)(?=\s(?:sang|qua|lúc|luc|vào|vao|ngày|ngay|thành|thanh|uu tiên|uu tien|dã|da|xong|done)\b|$)/iu,
      /task\s+(.+?)(?=\s(?:sang|qua|lúc|luc|vào|vao|ngày|ngay|thành|thanh|uu tiên|uu tien|dã|da|xong|done)\b|$)/iu,
      /(?:dánh d?u|danh dau)\s+(.+?)(?=\s(?:là|la|thành|thanh|xong|done|doing|todo)\b|$)/iu,
    ],
    delete_task: [
      /(?:xóa|xoa|delete|h?y|huy|b?|bo)\s+task\s+(.+?)(?=\s(?:ngày|ngay|lúc|luc|vào|vao|t?|tu|mai|hôm nay|hom nay)\b|$)/iu,
      /(?:xóa|xoa|delete|h?y|huy|b?|bo)\s+(.+)$/iu,
    ],
    set_goal: [
      /(?:m?c tiêu|muc tieu|goal)\s+(.+?)(?=\s(?:là|la|target|d?n|den|deadline|ngày|ngay|\d)\b|$)/iu,
      /(?:d?t|dat|set)\s+goal\s+(.+?)(?=\s(?:là|la|target|d?n|den|deadline|ngày|ngay|\d)\b|$)/iu,
    ],
  };

  return firstMatch(text, patternsByIntent[intent] || []);
}

function inferCreateTaskTitle(normalizedText) {
  const specific = normalizedText.match(
    /\b(?:co|lam|di)\s+([a-z0-9 ]+?)(?=\s(?:luc|vao|tu|ngay|mai|hom nay|uu tien|deadline|truoc)\b|$)/
  );
  if (specific?.[1]) {
    return cleanupTitle(specific[1]);
  }

  if (/\b(cuoc hop|meeting|hop)\b/.test(normalizedText)) {
    return "cuoc hop";
  }

  if (/\ban\b/.test(normalizedText)) {
    return "an";
  }

  return null;
}

function stripUpdateCommandPrefix(value) {
  const cleaned = cleanupTitle(value);
  if (!cleaned) {
    return null;
  }

  const stripped = cleaned
    .replace(
      /^(?:task\s+)?(?:danh dau|đánh dấu|cap nhat|cập nhật|sua|sửa|doi|đổi|chuyen|chuyển)\s+/iu,
      ""
    )
    .trim();

  if (!stripped) {
    return null;
  }

  const normalized = normalizeForMatch(stripped);
  if (["toi", "minh", "em", "anh", "chi", "ban", "no"].includes(normalized)) {
    return null;
  }

  return stripped;
}

function inferUpdateTaskTitle(text) {
  const patterns = [
    /^(.+?)\s+(?:da\s+)?(?:xong(?:\s+rồi|\s+roi)?|hoàn thành|hoan thanh|done|completed|finish(?:ed)?)\s*$/iu,
    /^(.+?)\s+(?:đang làm|dang lam|doing|in progress)\s*$/iu,
    /^(.+?)\s+(?:chưa làm|chua lam|chưa xong|chua xong|todo|to do|pending|not done)\s*$/iu,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const inferred = stripUpdateCommandPrefix(match[1]);
    if (inferred) {
      return inferred;
    }
  }

  return null;
}

export function inferUpdateTaskEntitiesFromText(text) {
  const normalizedText = normalizeForMatch(text);
  const title = inferUpdateTaskTitle(text);
  const status = extractStatus(normalizedText);

  return compactObject({
    title,
    status,
  });
}

function extractDeadlineDate(normalizedText, now) {
  const scopeMatch = normalizedText.match(/\b(?:deadline|den|truoc)\s+(.+)$/);
  if (!scopeMatch?.[1]) {
    return null;
  }

  return extractDateValue(scopeMatch[1], now);
}

export function extractEntities({ text, intent, now = new Date() }) {
  const normalizedText = normalizeForMatch(text);
  const date = extractDateValue(normalizedText, now);
  const range = extractTimeRange(normalizedText);
  const single = !range.start || !range.end ? extractSingleTime(normalizedText) : null;
  const start = range.start || single;
  const end = range.end || (single ? fromMinutes(toMinutes(single) + 60) : null);
  const normalizedRange = normalizeTimeRange(start, end);
  const priority = extractPriority(normalizedText);
  const status = extractStatus(normalizedText);
  let title = extractTitle(text, intent);
  if (!title && intent === "create_task") {
    title = inferCreateTaskTitle(normalizedText);
  }
  if (!title && intent === "update_task") {
    title = inferUpdateTaskTitle(text);
  }
  const target = extractGoalTarget(normalizedText);
  const count = extractRescheduleCount(normalizedText);
  const minutesBefore = extractReminderOffset(normalizedText);
  const durationMinutes = extractDurationMinutes(normalizedText);
  const deadline = extractDeadlineDate(normalizedText, now) || (intent === "set_goal" ? date : null);

  const entities = compactObject({
    title,
    date: intent === "set_goal" ? undefined : date,
    start: normalizedRange.start,
    end: normalizedRange.end,
    priority,
    status,
    target,
    count,
    deadline,
    minutes_before: minutesBefore,
    duration_minutes: durationMinutes,
  });

  return entities;
}

