import { assertNoTaskOverlap } from "@/lib/agent/workflow-engine/steps/checkOverlap";
import { formatCreateTaskReply } from "@/lib/agent/workflow-engine/steps/formatReply";
import { insertTask, upsertReminderJob } from "@/lib/agent/workflow-engine/steps/saveTask";
import { validateCreateTaskInput } from "@/lib/agent/workflow-engine/steps/validateInput";

export const createTaskWorkflow = [
  {
    name: "validate_input",
    run: async (ctx) => {
      ctx.state.createInput = validateCreateTaskInput(ctx.entities);
      return { normalized_fields: Object.keys(ctx.state.createInput) };
    },
  },
  {
    name: "check_overlap",
    run: async (ctx) => {
      await assertNoTaskOverlap({
        db: ctx.db,
        userId: ctx.userId,
        date: ctx.state.createInput.date,
        start: ctx.state.createInput.start,
        end: ctx.state.createInput.end,
      });
      return { overlap: false };
    },
  },
  {
    name: "save_task",
    run: async (ctx) => {
      ctx.state.createdTask = await insertTask({
        db: ctx.db,
        userId: ctx.userId,
        payload: ctx.state.createInput,
      });
      return { task_id: ctx.state.createdTask.id };
    },
  },
  {
    name: "schedule_reminder",
    run: async (ctx) => {
      if (ctx.state.createdTask.status === "done") {
        ctx.state.reminder = null;
        return { scheduled: false, reason: "task_already_done" };
      }

      const minutesBefore = ctx.state.createInput.minutes_before;

      ctx.state.reminder = await upsertReminderJob({
        db: ctx.db,
        userId: ctx.userId,
        taskId: ctx.state.createdTask.id,
        date: ctx.state.createdTask.date,
        start: ctx.state.createdTask.start,
        minutesBefore,
      });

      return {
        scheduled: true,
        reminder_id: ctx.state.reminder.id,
      };
    },
  },
  {
    name: "format_reply",
    run: async (ctx) => {
      ctx.result = formatCreateTaskReply(ctx.state.createdTask, ctx.state.reminder);
      return { message: ctx.result.message };
    },
  },
];
