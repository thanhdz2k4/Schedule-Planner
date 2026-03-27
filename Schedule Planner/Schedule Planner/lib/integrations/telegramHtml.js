const NUMBERED_TASK_LINE_REGEX = /^(\d+)\.\s*(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})\s*\|\s*(.+)$/;
const SIMPLE_HEADER_REGEX = /^.{1,140}:$/;
const TODAY_TASK_HEADER_REGEX = /^h[oô]m nay b[aạ]n c[oó]\s+\d+\s+task:?$/i;
const TAIL_TASK_COUNT_REGEX = /^\.{2,}\s+v[aà]\s+\d+\s+task kh[aá]c\.?$/i;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function normalizeForMatch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim();
}

function linkifyAndEscape(rawLine) {
  const line = typeof rawLine === "string" ? rawLine : "";
  if (!line) {
    return "";
  }

  const urlRegex = /https?:\/\/[^\s<>"']+/gi;
  let output = "";
  let cursor = 0;
  let match = urlRegex.exec(line);

  while (match) {
    const [url] = match;
    const index = match.index;
    output += escapeHtml(line.slice(cursor, index));
    output += `<a href="${escapeHtmlAttribute(url)}">${escapeHtml(url)}</a>`;
    cursor = index + url.length;
    match = urlRegex.exec(line);
  }

  output += escapeHtml(line.slice(cursor));
  return output;
}

function normalizeTimeRange(value) {
  return String(value || "").replace(/\s+/g, "");
}

function parseMetaParts(metaText) {
  const raw = typeof metaText === "string" ? metaText.trim() : "";
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveStatus(metaParts) {
  for (const part of metaParts) {
    const normalized = normalizeForMatch(part);
    if (normalized.includes("hoan thanh") || normalized.includes("done") || normalized.includes("completed")) {
      return { icon: "✅", label: "Hoàn thành" };
    }
    if (normalized.includes("dang lam") || normalized.includes("doing") || normalized.includes("in progress")) {
      return { icon: "🔄", label: "Đang làm" };
    }
    if (
      normalized.includes("chua lam") ||
      normalized.includes("todo") ||
      normalized.includes("pending") ||
      normalized.includes("open")
    ) {
      return { icon: "🟡", label: "Chưa làm" };
    }
  }
  return { icon: "🔹", label: "" };
}

function resolvePriority(metaParts) {
  for (const part of metaParts) {
    const normalized = normalizeForMatch(part);
    if (
      normalized.includes("uu tien cao") ||
      normalized.includes("priority high") ||
      normalized === "high" ||
      normalized.includes("high priority")
    ) {
      return "Cao";
    }
    if (
      normalized.includes("uu tien trung binh") ||
      normalized.includes("priority medium") ||
      normalized === "medium" ||
      normalized.includes("trung binh")
    ) {
      return "Trung bình";
    }
    if (
      normalized.includes("uu tien thap") ||
      normalized.includes("priority low") ||
      normalized === "low" ||
      normalized.includes("thap")
    ) {
      return "Thấp";
    }
  }
  return "";
}

function parseTaskTitleAndMeta(titlePart) {
  const raw = typeof titlePart === "string" ? titlePart.trim() : "";
  if (!raw) {
    return { title: "", metaText: "" };
  }

  const metaMatch = raw.match(/\(([^()]*)\)\s*$/);
  if (!metaMatch) {
    return { title: raw, metaText: "" };
  }

  return {
    title: raw.slice(0, metaMatch.index).trim(),
    metaText: metaMatch[1].trim(),
  };
}

function formatTaskEntry(trimmedLine) {
  const matched = trimmedLine.match(NUMBERED_TASK_LINE_REGEX);
  if (!matched) {
    return null;
  }

  const [, , rawTimeRange, rawTitlePart] = matched;
  const timeRange = normalizeTimeRange(rawTimeRange);
  const { title, metaText } = parseTaskTitleAndMeta(rawTitlePart);
  const metaParts = parseMetaParts(metaText);
  const status = resolveStatus(metaParts);
  const priority = resolvePriority(metaParts);

  const titleText = title || rawTitlePart;
  const header = `${status.icon} <b>${escapeHtml(timeRange)}</b> — ${linkifyAndEscape(titleText)}`;

  const details = [];
  if (status.label) {
    details.push(status.label);
  }
  if (priority) {
    details.push(`Ưu tiên: ${priority}`);
  }

  if (!details.length && metaText) {
    details.push(metaText);
  }

  if (details.length) {
    return `${header}\n<i>${escapeHtml(details.join(" • "))}</i>`;
  }

  return header;
}

function formatTodaySummaryLine(trimmedLine) {
  const match = trimmedLine.match(
    /^H[oô]m nay b[aạ]n c[oó]\s+(\d+)\s+task,\s+đ[aã]\s+ho[aà]n th[aà]nh\s+(\d+),\s+c[oò]n\s+(\d+)\.\s+T[oổ]ng th[oờ]i gian d[uự] ki[eế]n\s+([\d.,]+)\s+gi[oờ]\.?$/i
  );

  if (!match) {
    return "";
  }

  const [, total, done, open, hours] = match;
  return [
    "📊 <b>Tóm tắt hôm nay</b>",
    `• Tổng task: <b>${escapeHtml(total)}</b>`,
    `• Hoàn thành: <b>${escapeHtml(done)}</b>`,
    `• Còn lại: <b>${escapeHtml(open)}</b>`,
    `• Tổng thời gian: <b>${escapeHtml(hours)} giờ</b>`,
  ].join("\n");
}

function highlightTimeRanges(htmlLine) {
  if (!htmlLine) {
    return "";
  }

  return htmlLine.replace(/\b(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})\b/g, "<b>$1</b>");
}

function formatLine(line) {
  const raw = typeof line === "string" ? line : "";
  const trimmed = raw.trim();
  if (!trimmed) {
    return { text: "", kind: "blank" };
  }

  const summary = formatTodaySummaryLine(trimmed);
  if (summary) {
    return { text: summary, kind: "summary" };
  }

  const taskEntry = formatTaskEntry(trimmed);
  if (taskEntry) {
    return { text: taskEntry, kind: "task" };
  }

  if (TODAY_TASK_HEADER_REGEX.test(trimmed)) {
    return { text: `📋 <b>${linkifyAndEscape(trimmed.replace(/:$/, ""))}</b>`, kind: "header" };
  }

  if (TAIL_TASK_COUNT_REGEX.test(trimmed)) {
    return { text: `<i>${linkifyAndEscape(trimmed)}</i>`, kind: "tail" };
  }

  if (SIMPLE_HEADER_REGEX.test(trimmed) && !trimmed.includes("|")) {
    return { text: `<b>${linkifyAndEscape(trimmed)}</b>`, kind: "header" };
  }

  return { text: highlightTimeRanges(linkifyAndEscape(raw)), kind: "text" };
}

function formatCodeBlock(lines) {
  if (!lines.length) {
    return "";
  }

  return `<pre>${escapeHtml(lines.join("\n"))}</pre>`;
}

function trimBlankLines(lines) {
  const compact = [];
  for (const line of lines) {
    if (!line) {
      if (!compact.length || !compact[compact.length - 1]) {
        continue;
      }
      compact.push("");
      continue;
    }
    compact.push(line);
  }

  while (compact.length && !compact[0]) {
    compact.shift();
  }
  while (compact.length && !compact[compact.length - 1]) {
    compact.pop();
  }

  return compact;
}

export function convertTextToTelegramHtml(text) {
  const source = typeof text === "string" ? text.replace(/\r\n?/g, "\n").trim() : "";
  if (!source) {
    return "";
  }

  const lines = source.split("\n");
  const output = [];
  let inCodeBlock = false;
  let codeLines = [];

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        output.push(formatCodeBlock(codeLines));
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    const formatted = formatLine(line);
    output.push(formatted.text);

    if (formatted.kind === "task") {
      output.push("");
    }
  }

  if (inCodeBlock && codeLines.length) {
    output.push(formatCodeBlock(codeLines));
  }

  return trimBlankLines(output).join("\n");
}

export function resolveTelegramMessageFormat({ text, htmlText = "", parseMode = "" }) {
  const safeText = typeof text === "string" ? text.trim() : "";
  const safeHtmlText = typeof htmlText === "string" ? htmlText.trim() : "";
  const safeParseMode = typeof parseMode === "string" ? parseMode.trim() : "";

  if (safeHtmlText) {
    return {
      text: safeHtmlText,
      parseMode: safeParseMode || "HTML",
    };
  }

  return {
    text: safeText,
    parseMode: safeParseMode,
  };
}
