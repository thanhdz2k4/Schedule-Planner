import { createManagedAssistantAction } from "@/lib/proactive/actionService";
import {
  buildConflictAlertProposal,
  buildDetectRiskPayload,
  buildRiskAlertProposal,
  loadTasksForDateRange,
  loadTasksUpToDate,
  loadUserProfileForPlanner,
  resolveUserLocalClock,
} from "@/lib/proactive/proposalBuilder";

export const detectRiskWorkflow = [
  {
    name: "resolve_local_context",
    run: async (ctx) => {
      ctx.state.userProfile = await loadUserProfileForPlanner(ctx.db, ctx.userId);
      ctx.state.localClock = resolveUserLocalClock(ctx.now, ctx.state.userProfile.timezone);

      return {
        local_date: ctx.state.localClock.date,
        local_time: ctx.state.localClock.time,
      };
    },
  },
  {
    name: "load_tasks",
    run: async (ctx) => {
      const [tasksToday, tasksUpToToday] = await Promise.all([
        loadTasksForDateRange(ctx.db, {
          userId: ctx.userId,
          fromDate: ctx.state.localClock.date,
          toDate: ctx.state.localClock.date,
        }),
        loadTasksUpToDate(ctx.db, {
          userId: ctx.userId,
          toDate: ctx.state.localClock.date,
        }),
      ]);

      ctx.state.tasksToday = tasksToday;
      ctx.state.tasksUpToToday = tasksUpToToday;

      return {
        today_count: tasksToday.length,
        up_to_today_count: tasksUpToToday.length,
      };
    },
  },
  {
    name: "detect_risks",
    run: async (ctx) => {
      ctx.state.riskPayload = buildDetectRiskPayload({
        tasksToday: ctx.state.tasksToday,
        tasksUpToToday: ctx.state.tasksUpToToday,
        localClock: ctx.state.localClock,
      });

      return {
        conflict_count: ctx.state.riskPayload.data.conflict_count,
        overdue_count: ctx.state.riskPayload.data.overdue_count,
      };
    },
  },
  {
    name: "propose_actions",
    run: async (ctx) => {
      const proposals = [];
      const conflictProposal = buildConflictAlertProposal({
        tasksToday: ctx.state.tasksToday,
        localClock: ctx.state.localClock,
      });
      if (conflictProposal) {
        proposals.push(conflictProposal);
      }

      const riskProposal = buildRiskAlertProposal({
        tasksUpToToday: ctx.state.tasksUpToToday,
        localClock: ctx.state.localClock,
      });
      if (riskProposal) {
        proposals.push(riskProposal);
      }

      ctx.state.actions = [];
      for (const proposal of proposals) {
        const action = await createManagedAssistantAction(ctx.db, {
          userId: ctx.userId,
          actionType: proposal.actionType,
          riskLevel: proposal.riskLevel,
          title: proposal.title,
          summary: proposal.summary,
          payload: proposal.payload,
          dedupeKey: proposal.dedupeKey,
          sourceWorkflow: "detect_risk",
        });

        if (action) {
          ctx.state.actions.push({
            id: action.id,
            action_type: action.actionType,
            mode: action.mode,
            status: action.status,
          });
        }
      }

      return {
        proposed_actions: ctx.state.actions.length,
      };
    },
  },
  {
    name: "format_reply",
    run: async (ctx) => {
      ctx.result = {
        message: ctx.state.riskPayload.summary,
        query_type: "detect_risk",
        data: {
          ...ctx.state.riskPayload.data,
          actions: ctx.state.actions || [],
        },
      };
      return {
        message: ctx.result.message,
      };
    },
  },
];
