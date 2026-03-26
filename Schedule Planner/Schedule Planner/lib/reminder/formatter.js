import { DEFAULT_REMINDER_LEAD_SECONDS, normalizeLeadSeconds } from "@/lib/reminder/scheduler";

function toDateString(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  return "";
}

function toTimeString(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(11, 16);
  }

  if (typeof value === "string") {
    return value.slice(0, 5);
  }

  return "";
}

function formatLeadTimeText(totalSeconds) {
  if (!Number.isInteger(totalSeconds) || totalSeconds < 0) {
    return "5 phut";
  }

  if (totalSeconds === 0) {
    return "0 giay";
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0 && seconds > 0) {
    return `${minutes} phut ${seconds} giay`;
  }

  if (minutes > 0) {
    return `${minutes} phut`;
  }

  return `${seconds} giay`;
}

export function formatReminderWindow({ date, start, end, timezone }) {
  const dateText = toDateString(date);
  const startText = toTimeString(start);
  const endText = toTimeString(end);
  const tzText = typeof timezone === "string" && timezone.trim() ? timezone.trim() : "UTC";
  return `${dateText} ${startText} - ${endText} (${tzText})`;
}

export function buildReminderEmailContent({
  taskTitle,
  date,
  start,
  end,
  priority,
  timezone,
  leadSeconds = DEFAULT_REMINDER_LEAD_SECONDS,
}) {
  const safeTaskTitle = typeof taskTitle === "string" && taskTitle.trim() ? taskTitle.trim() : "Untitled task";
  const safePriority = typeof priority === "string" && priority.trim() ? priority.trim() : "medium";
  const safeLeadSeconds = normalizeLeadSeconds(leadSeconds, DEFAULT_REMINDER_LEAD_SECONDS);
  const safeLeadText = formatLeadTimeText(safeLeadSeconds);
  const windowText = formatReminderWindow({ date, start, end, timezone });

  const subject = `[Schedule Planner] Nhac lich: \"${safeTaskTitle}\" bat dau sau ${safeLeadText}`;
  const lines = [
    "Xin chao,",
    "",
    "Ban co lich sap den:",
    `- Task: ${safeTaskTitle}`,
    `- Thoi gian: ${windowText}`,
    `- Nhac truoc: ${safeLeadText}`,
    `- Uu tien: ${safePriority}`,
    "",
    "Sent by Schedule Planner",
  ];

  const textBody = lines.join("\n");
  const htmlBody = [
    "<p>Xin chao,</p>",
    "<p>Ban co lich sap den:</p>",
    "<ul>",
    `  <li><strong>Task:</strong> ${safeTaskTitle}</li>`,
    `  <li><strong>Thoi gian:</strong> ${windowText}</li>`,
    `  <li><strong>Nhac truoc:</strong> ${safeLeadText}</li>`,
    `  <li><strong>Uu tien:</strong> ${safePriority}</li>`,
    "</ul>",
    "<p>Sent by Schedule Planner</p>",
  ].join("\n");

  return {
    subject,
    textBody,
    htmlBody,
  };
}
