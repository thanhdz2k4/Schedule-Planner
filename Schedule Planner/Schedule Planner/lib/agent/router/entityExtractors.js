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
  const rangeMatch = normalizedText.match(
    /\btu\s*(\d{1,2})(?:[:h](\d{1,2}))?\s*(?:den|toi|-)\s*(\d{1,2})(?:[:h](\d{1,2}))?\b/
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
  const markerMatch = normalizedText.match(/\b(?:luc|vao|at)\s*(\d{1,2})(?:[:h](\d{1,2}))?\b/);
  if (markerMatch) {
    return parseTimeParts(markerMatch[1], markerMatch[2], normalizedText);
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

  if (/\b(hoan thanh|xong|done)\b/.test(normalizedText)) {
    return "done";
  }

  if (/\b(dang lam|in progress|doing)\b/.test(normalizedText)) {
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
      /(?:tạo|tao|thêm|them|add|đặt|dat|lên|len)\s+task\s+(.+?)(?=\s(?:lúc|luc|vào|vao|từ|tu|ngày|ngay|mai|hôm nay|hom nay|ưu tiên|uu tien|deadline|trước|truoc)\b|$)/i,
      /(?:nhắc tôi|nhac toi)\s+(.+?)(?=\s(?:lúc|luc|vào|vao|từ|tu|ngày|ngay|mai|hôm nay|hom nay|trước|truoc)\b|$)/i,
      /task\s+(.+?)(?=\s(?:lúc|luc|vào|vao|từ|tu|ngày|ngay|mai|hôm nay|hom nay|ưu tiên|uu tien|deadline|trước|truoc)\b|$)/i,
    ],
    update_task: [
      /(?:sửa|sua|cập nhật|cap nhat|dời|doi|chuyển|chuyen|đánh dấu|danh dau)\s+task\s+(.+?)(?=\s(?:sang|qua|lúc|luc|vào|vao|ngày|ngay|thành|thanh|ưu tiên|uu tien|đã|da|xong|done)\b|$)/i,
      /task\s+(.+?)(?=\s(?:sang|qua|lúc|luc|vào|vao|ngày|ngay|thành|thanh|ưu tiên|uu tien|đã|da|xong|done)\b|$)/i,
    ],
    delete_task: [
      /(?:xóa|xoa|delete|hủy|huy|bỏ|bo)\s+task\s+(.+?)(?=\s(?:ngày|ngay|lúc|luc|vào|vao|từ|tu|mai|hôm nay|hom nay)\b|$)/i,
      /(?:xóa|xoa|delete|hủy|huy|bỏ|bo)\s+(.+)$/i,
    ],
    set_goal: [
      /(?:mục tiêu|muc tieu|goal)\s+(.+?)(?=\s(?:là|la|target|đến|den|deadline|ngày|ngay|\d)\b|$)/i,
      /(?:đặt|dat|set)\s+goal\s+(.+?)(?=\s(?:là|la|target|đến|den|deadline|ngày|ngay|\d)\b|$)/i,
    ],
  };

  return firstMatch(text, patternsByIntent[intent] || []);
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
  const single = (!range.start || !range.end) ? extractSingleTime(normalizedText) : null;
  const start = range.start || single;
  const end = range.end || (single ? fromMinutes(toMinutes(single) + 60) : null);
  const normalizedRange = normalizeTimeRange(start, end);
  const priority = extractPriority(normalizedText);
  const status = extractStatus(normalizedText);
  const title = extractTitle(text, intent);
  const target = extractGoalTarget(normalizedText);
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
    deadline,
    minutes_before: minutesBefore,
    duration_minutes: durationMinutes,
  });

  return entities;
}
