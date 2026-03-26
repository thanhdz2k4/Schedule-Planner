import {
  buildPlanWeekPayload,
  loadTasksForDateRange,
  loadUserProfileForPlanner,
  resolveCurrentWeekRange,
  resolveUserLocalClock,
} from "@/lib/proactive/proposalBuilder";

export const planWeekWorkflow = [
  {
    name: "resolve_week_range",
    run: async (ctx) => {
      ctx.state.userProfile = await loadUserProfileForPlanner(ctx.db, ctx.userId);
      ctx.state.localClock = resolveUserLocalClock(ctx.now, ctx.state.userProfile.timezone);
      ctx.state.weekRange = resolveCurrentWeekRange(ctx.state.localClock.date);

      return {
        week_from: ctx.state.weekRange.from,
        week_to: ctx.state.weekRange.to,
      };
    },
  },
  {
    name: "load_week_tasks",
    run: async (ctx) => {
      ctx.state.tasksWeek = await loadTasksForDateRange(ctx.db, {
        userId: ctx.userId,
        fromDate: ctx.state.weekRange.from,
        toDate: ctx.state.weekRange.to,
      });

      return {
        task_count: ctx.state.tasksWeek.length,
      };
    },
  },
  {
    name: "build_plan",
    run: async (ctx) => {
      ctx.state.planPayload = buildPlanWeekPayload({
        tasksWeek: ctx.state.tasksWeek,
        localDate: ctx.state.localClock.date,
      });

      return {
        open_tasks: ctx.state.planPayload.data.open_tasks,
      };
    },
  },
  {
    name: "format_reply",
    run: async (ctx) => {
      ctx.result = {
        message: ctx.state.planPayload.summary,
        query_type: "plan_week",
        data: ctx.state.planPayload.data,
      };
      return {
        message: ctx.result.message,
      };
    },
  },
];
