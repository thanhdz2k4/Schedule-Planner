import { formatDeleteTaskReply } from "@/lib/agent/workflow-engine/steps/formatReply";
import { cancelPendingReminderJobs, deleteTaskById, resolveTaskTarget } from "@/lib/agent/workflow-engine/steps/saveTask";
import { validateDeleteTaskInput } from "@/lib/agent/workflow-engine/steps/validateInput";

export const deleteTaskWorkflow = [
  {
    name: "resolve_task_target",
    run: async (ctx) => {
      const targetInput = validateDeleteTaskInput(ctx.entities);

      ctx.state.targetTask = await resolveTaskTarget({
        db: ctx.db,
        userId: ctx.userId,
        taskId: targetInput.task_id,
        title: targetInput.title,
        date: targetInput.date,
      });

      return { task_id: ctx.state.targetTask.id };
    },
  },
  {
    name: "cancel_reminder_jobs",
    run: async (ctx) => {
      const canceled = await cancelPendingReminderJobs({
        db: ctx.db,
        userId: ctx.userId,
        taskId: ctx.state.targetTask.id,
        reason: "task_deleted",
      });

      ctx.state.canceledReminderCount = canceled;
      return { canceled_reminders: canceled };
    },
  },
  {
    name: "delete_task",
    run: async (ctx) => {
      ctx.state.deletedTask = await deleteTaskById({
        db: ctx.db,
        userId: ctx.userId,
        taskId: ctx.state.targetTask.id,
      });

      return { deleted_task_id: ctx.state.deletedTask.id };
    },
  },
  {
    name: "format_reply",
    run: async (ctx) => {
      ctx.result = formatDeleteTaskReply(ctx.state.deletedTask, ctx.state.canceledReminderCount || 0);
      return { message: ctx.result.message };
    },
  },
];
