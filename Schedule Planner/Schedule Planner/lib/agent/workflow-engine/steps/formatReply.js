function formatReminderOffset(reminder) {
  if (!reminder) {
    return "No reminder scheduled.";
  }

  const leadSeconds = Number.parseInt(reminder.lead_seconds, 10);
  if (!Number.isInteger(leadSeconds) || leadSeconds < 0) {
    return `Reminder scheduled ${reminder.minutes_before} minute(s) before start.`;
  }

  if (leadSeconds === 0) {
    return "Reminder scheduled exactly at start time.";
  }

  const minutes = Math.floor(leadSeconds / 60);
  const seconds = leadSeconds % 60;
  if (minutes > 0 && seconds > 0) {
    return `Reminder scheduled ${minutes} minute(s) ${seconds} second(s) before start.`;
  }
  if (minutes > 0) {
    return `Reminder scheduled ${minutes} minute(s) before start.`;
  }
  return `Reminder scheduled ${seconds} second(s) before start.`;
}

export function formatCreateTaskReply(task, reminder) {
  const reminderText = formatReminderOffset(reminder);

  return {
    message: `Created task "${task.title}" on ${task.date} ${task.start}-${task.end}.`,
    task,
    reminder: reminder || null,
    reminder_text: reminderText,
  };
}

export function formatUpdateTaskReply(before, after, reminderInfo) {
  return {
    message: `Updated task "${after.title}" successfully.`,
    before,
    after,
    reminder: reminderInfo || null,
  };
}

export function formatDeleteTaskReply(task, canceledReminderCount) {
  return {
    message: `Deleted task "${task.title}".`,
    deleted_task: task,
    canceled_reminders: canceledReminderCount,
  };
}

export function formatQueryReply(payload) {
  return {
    message: payload.summary,
    query_type: payload.query_type,
    data: payload.data,
  };
}
