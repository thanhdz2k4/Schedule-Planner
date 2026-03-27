const NUMBERED_TASK_LINE_REGEX = /^(\d+)\.\s*(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})\s*\|\s*(.+)$/;
const SIMPLE_HEADER_REGEX = /^.{1,140}:$/;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
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
  return value.replace(/\s+/g, "");
}

function highlightTimeRanges(htmlLine) {
  if (!htmlLine) {
    return "";
  }

  return htmlLine.replace(/\b(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})\b/g, "<b>$1</b>");
}

function formatNumberedTaskLine(trimmedLine) {
  const matched = trimmedLine.match(NUMBERED_TASK_LINE_REGEX);
  if (!matched) {
    return "";
  }

  const [, index, timeRange, titlePart] = matched;
  return `${escapeHtml(index)}. <b>${escapeHtml(normalizeTimeRange(timeRange))}</b> | ${linkifyAndEscape(
    titlePart
  )}`;
}

function formatLine(line) {
  const raw = typeof line === "string" ? line : "";
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  const taskLine = formatNumberedTaskLine(trimmed);
  if (taskLine) {
    return taskLine;
  }

  if (SIMPLE_HEADER_REGEX.test(trimmed) && !trimmed.includes("|")) {
    return `<b>${linkifyAndEscape(trimmed)}</b>`;
  }

  return highlightTimeRanges(linkifyAndEscape(raw));
}

function formatCodeBlock(lines) {
  if (!lines.length) {
    return "";
  }

  return `<pre>${escapeHtml(lines.join("\n"))}</pre>`;
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

    output.push(formatLine(line));
  }

  if (inCodeBlock && codeLines.length) {
    output.push(formatCodeBlock(codeLines));
  }

  return output.join("\n");
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
