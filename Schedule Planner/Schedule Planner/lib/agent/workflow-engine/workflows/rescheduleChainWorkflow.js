import { BusinessError } from "@/lib/agent/workflow-engine/errors";
import { createManagedAssistantAction } from "@/lib/proactive/actionService";
import {
  buildRescheduleChainPayload,
  loadTasksUpToDate,
  loadUserProfileForPlanner,
  resolveUserLocalClock,
} from "@/lib/proactive/proposalBuilder";

function resolveRequestedCount(entities) {
  const parsed = Number.parseInt(entities?.count, 10);
  if (!Number.isInteger(parsed)) {
    return 3;
  }

  return Math.max(1, Math.min(10, parsed));
}

export const rescheduleChainWorkflow = [
  {
    name: "resolve_local_context",
    run: async (ctx) => {
      ctx.state.userProfile = await loadUserProfileForPlanner(ctx.db, ctx.userId);
      ctx.state.localClock = resolveUserLocalClock(ctx.now, ctx.state.userProfile.timezone);
      ctx.state.maxItems = resolveRequestedCount(ctx.entities);

      return {
        local_date: ctx.state.localClock.date,
        max_items: ctx.state.maxItems,
      };
    },
  },
  {
    name: "load_tasks",
    run: async (ctx) => {
      ctx.state.tasksUpToToday = await loadTasksUpToDate(ctx.db, {
        userId: ctx.userId,
        toDate: ctx.state.localClock.date,
      });

      return {
        task_count: ctx.state.tasksUpToToday.length,
      };
    },
  },
  {
    name: "build_suggestions",
    run: async (ctx) => {
      ctx.state.suggestionPayload = buildRescheduleChainPayload({
        tasksUpToToday: ctx.state.tasksUpToToday,
        localClock: ctx.state.localClock,
        maxItems: ctx.state.maxItems,
      });

      if (!ctx.state.suggestionPayload.data.suggestions.length) {
        throw new BusinessError("No overdue tasks found for reschedule chain.", {
          code: "NO_RESCHEDULE_TARGET",
          status: 409,
        });
      }

      return {
        suggestion_count: ctx.state.suggestionPayload.data.suggestions.length,
      };
    },
  },
  {
    name: "create_approval_action",
    run: async (ctx) => {
      const dedupeKey = `reschedule_chain:${ctx.state.localClock.date}:${ctx.state.suggestionPayload.data.suggestions.length}`;

      const action = await createManagedAssistantAction(ctx.db, {
        userId: ctx.userId,
        actionType: "reschedule_chain",
        riskLevel: "high",
        title: `Reschedule chain proposal (${ctx.state.suggestionPayload.data.suggestions.length})`,
        summary: ctx.state.suggestionPayload.summary,
        payload: ctx.state.suggestionPayload.data,
        dedupeKey,
        sourceWorkflow: "reschedule_chain",
      });

      if (!action) {
        throw new BusinessError("Cannot create reschedule approval action.", {
          code: "RESCHEDULE_ACTION_CREATE_FAILED",
          status: 500,
        });
      }

      ctx.state.action = action;
      return {
        action_id: action.id,
        action_status: action.status,
      };
    },
  },
  {
    name: "format_reply",
    run: async (ctx) => {
      const statusText =
        ctx.state.action.status === "pending_approval"
          ? "Action requires approval."
          : ctx.state.action.status === "denied"
          ? "Action denied by policy."
          : "Action created.";

      ctx.result = {
        message: `${ctx.state.suggestionPayload.summary} ${statusText}`,
        query_type: "reschedule_chain",
        data: {
          ...ctx.state.suggestionPayload.data,
          action: {
            id: ctx.state.action.id,
            status: ctx.state.action.status,
            mode: ctx.state.action.mode,
            title: ctx.state.action.title,
          },
        },
      };
      return {
        message: ctx.result.message,
      };
    },
  },
];
