import {
  buildPlanDayPayload,
  loadFocusWindowPreference,
  loadTasksForDateRange,
  loadUserProfileForPlanner,
  resolveUserLocalClock,
} from "@/lib/proactive/proposalBuilder";

export const planDayWorkflow = [
  {
    name: "resolve_local_clock",
    run: async (ctx) => {
      ctx.state.userProfile = await loadUserProfileForPlanner(ctx.db, ctx.userId);
      ctx.state.localClock = resolveUserLocalClock(ctx.now, ctx.state.userProfile.timezone);

      return {
        timezone: ctx.state.localClock.timezone,
        local_date: ctx.state.localClock.date,
      };
    },
  },
  {
    name: "load_today_tasks",
    run: async (ctx) => {
      ctx.state.tasksToday = await loadTasksForDateRange(ctx.db, {
        userId: ctx.userId,
        fromDate: ctx.state.localClock.date,
        toDate: ctx.state.localClock.date,
      });

      return {
        task_count: ctx.state.tasksToday.length,
      };
    },
  },
  {
    name: "load_focus_window",
    run: async (ctx) => {
      ctx.state.focusWindow = await loadFocusWindowPreference(ctx.db, ctx.userId);
      return {
        focus_window: ctx.state.focusWindow || null,
      };
    },
  },
  {
    name: "build_plan",
    run: async (ctx) => {
      ctx.state.planPayload = buildPlanDayPayload({
        tasksToday: ctx.state.tasksToday,
        localClock: ctx.state.localClock,
        focusWindow: ctx.state.focusWindow,
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
        query_type: "plan_day",
        data: ctx.state.planPayload.data,
      };
      return {
        message: ctx.result.message,
      };
    },
  },
];
