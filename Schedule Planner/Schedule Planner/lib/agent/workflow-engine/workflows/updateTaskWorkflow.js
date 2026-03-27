import { assertNoTaskOverlap } from "@/lib/agent/workflow-engine/steps/checkOverlap";
import { formatUpdateTaskReply } from "@/lib/agent/workflow-engine/steps/formatReply";
import {
  cancelPendingReminderJobs,
  resolveTaskTarget,
  updateTaskById,
  upsertReminderJob,
} from "@/lib/agent/workflow-engine/steps/saveTask";
import {
  validateUpdateTaskPatch,
  validateUpdateTaskTargetInput,
} from "@/lib/agent/workflow-engine/steps/validateInput";

export const updateTaskWorkflow = [
  {
    name: "resolve_task_target",
    run: async (ctx) => {
      const targetInput = validateUpdateTaskTargetInput(ctx.entities);

      ctx.state.targetTask = await resolveTaskTarget({
        db: ctx.db,
        userId: ctx.userId,
        taskId: targetInput.task_id,
        title: targetInput.title,
        date: targetInput.date,
      });

      ctx.state.taskBeforeUpdate = { ...ctx.state.targetTask };
      return { task_id: ctx.state.targetTask.id };
    },
  },
  {
    name: "validate_patch",
    run: async (ctx) => {
      ctx.state.patchPlan = validateUpdateTaskPatch(ctx.entities, ctx.state.targetTask);
      return {
        patch_fields: Object.keys(ctx.state.patchPlan.taskPatch),
        has_reminder_patch: Boolean(ctx.state.patchPlan.reminderPatch),
      };
    },
  },
  {
    name: "check_overlap",
    run: async (ctx) => {
      if (!ctx.state.patchPlan.shouldRecheckOverlap) {
        return { overlap_check_skipped: true };
      }

      await assertNoTaskOverlap({
        db: ctx.db,
        userId: ctx.userId,
        date: ctx.state.patchPlan.targetWindow.date,
        start: ctx.state.patchPlan.targetWindow.start,
        end: ctx.state.patchPlan.targetWindow.end,
        excludeTaskId: ctx.state.targetTask.id,
      });

      return { overlap: false };
    },
  },
  {
    name: "save_task",
    run: async (ctx) => {
      if (!Object.keys(ctx.state.patchPlan.taskPatch).length) {
        ctx.state.updatedTask = ctx.state.targetTask;
        return { task_updated: false };
      }

      ctx.state.updatedTask = await updateTaskById({
        db: ctx.db,
        userId: ctx.userId,
        taskId: ctx.state.targetTask.id,
        patch: ctx.state.patchPlan.taskPatch,
      });

      return {
        task_updated: true,
        task_id: ctx.state.updatedTask.id,
      };
    },
  },
  {
    name: "rebuild_reminder_job",
    run: async (ctx) => {
      if (ctx.state.patchPlan.reminderPatch) {
        const reminder = await upsertReminderJob({
          db: ctx.db,
          userId: ctx.userId,
          taskId: ctx.state.updatedTask.id,
          date: ctx.state.updatedTask.date,
          start: ctx.state.updatedTask.start,
          minutesBefore: ctx.state.patchPlan.reminderPatch.minutes_before,
        });

        ctx.state.reminderInfo = {
          action: "upserted",
          ...reminder,
        };
        return ctx.state.reminderInfo;
      }

      if (ctx.state.patchPlan.shouldRecheckOverlap) {
        const canceled = await cancelPendingReminderJobs({
          db: ctx.db,
          userId: ctx.userId,
          taskId: ctx.state.updatedTask.id,
          reason: "task_updated_without_new_offset",
        });

        ctx.state.reminderInfo = {
          action: "canceled_pending",
          canceled_count: canceled,
        };
        return ctx.state.reminderInfo;
      }

      ctx.state.reminderInfo = {
        action: "unchanged",
      };
      return ctx.state.reminderInfo;
    },
  },
  {
    name: "format_reply",
    run: async (ctx) => {
      ctx.result = formatUpdateTaskReply(
        ctx.state.taskBeforeUpdate,
        ctx.state.updatedTask,
        ctx.state.reminderInfo
      );
      return { message: ctx.result.message };
    },
  },
];
