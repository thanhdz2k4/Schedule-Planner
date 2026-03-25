export function formatCreateTaskReply(task, reminder) {
  const reminderText = reminder
    ? `Reminder scheduled ${reminder.minutes_before} minute(s) before start.`
    : "No reminder scheduled.";

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
