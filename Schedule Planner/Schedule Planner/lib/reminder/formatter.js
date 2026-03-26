import { DEFAULT_REMINDER_LEAD_MINUTES } from "@/lib/reminder/scheduler";

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
  leadMinutes = DEFAULT_REMINDER_LEAD_MINUTES,
}) {
  const safeTaskTitle = typeof taskTitle === "string" && taskTitle.trim() ? taskTitle.trim() : "Untitled task";
  const safePriority = typeof priority === "string" && priority.trim() ? priority.trim() : "medium";
  const safeLeadMinutes = Number.isInteger(leadMinutes) && leadMinutes >= 0 ? leadMinutes : DEFAULT_REMINDER_LEAD_MINUTES;
  const windowText = formatReminderWindow({ date, start, end, timezone });

  const subject = `[Schedule Planner] Nhac lich: \"${safeTaskTitle}\" bat dau sau ${safeLeadMinutes} phut`;
  const lines = [
    "Xin chao,",
    "",
    "Ban co lich sap den:",
    `- Task: ${safeTaskTitle}`,
    `- Thoi gian: ${windowText}`,
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
