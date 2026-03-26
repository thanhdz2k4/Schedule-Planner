import { createManagedAssistantAction, executeAssistantActionNow } from "@/lib/proactive/actionService";
import {
  buildConflictAlertProposal,
  buildDailyDigestProposal,
  buildRiskAlertProposal,
  loadTasksForDateRange,
  loadTasksUpToDate,
  loadUserProfileForPlanner,
  resolveCurrentWeekRange,
  resolveUserLocalClock,
} from "@/lib/proactive/proposalBuilder";
import { withTransaction } from "@/lib/db/client";
import { ensureMigrations } from "@/lib/db/migrate";
import { ensureUserExists } from "@/lib/db/users";

function normalizeLimit(value, fallback = 50) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.max(1, Math.min(500, parsed));
}

async function listTargetUsers(db, { userId = null, limit = 50 }) {
  const safeLimit = normalizeLimit(limit, 50);

  if (userId) {
    const result = await db.query(
      `
        SELECT id, email, timezone
        FROM users
        WHERE id = $1::uuid
        LIMIT 1
      `,
      [userId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      email: row.email || "",
      timezone: row.timezone || "Asia/Ho_Chi_Minh",
    }));
  }

  const result = await db.query(
    `
      SELECT id, email, timezone
      FROM users
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    email: row.email || "",
    timezone: row.timezone || "Asia/Ho_Chi_Minh",
  }));
}

async function createProposalsForUser(db, userProfile, now) {
  await ensureUserExists(db, userProfile.id);

  const localClock = resolveUserLocalClock(now, userProfile.timezone);
  const weekRange = resolveCurrentWeekRange(localClock.date);
  const [tasksToday, tasksUpToToday] = await Promise.all([
    loadTasksForDateRange(db, {
      userId: userProfile.id,
      fromDate: localClock.date,
      toDate: localClock.date,
    }),
    loadTasksUpToDate(db, {
      userId: userProfile.id,
      toDate: localClock.date,
    }),
  ]);

  const proposals = [];
  proposals.push(buildDailyDigestProposal({ tasksToday, localClock }));

  const conflictProposal = buildConflictAlertProposal({ tasksToday, localClock });
  if (conflictProposal) {
    proposals.push(conflictProposal);
  }

  const riskProposal = buildRiskAlertProposal({ tasksUpToToday, localClock });
  if (riskProposal) {
    proposals.push(riskProposal);
  }

  const weekSummary = await loadTasksForDateRange(db, {
    userId: userProfile.id,
    fromDate: weekRange.from,
    toDate: weekRange.to,
  });
  if (weekSummary.length > 0) {
    proposals.push({
      actionType: "plan_week",
      riskLevel: "low",
      title: `Weekly planning pulse ${weekRange.from}..${weekRange.to}`,
      summary: `Week currently has ${weekSummary.length} tasks. Review priorities before weekend.`,
      dedupeKey: `plan_week:${weekRange.from}:${weekSummary.length}`,
      payload: {
        week_from: weekRange.from,
        week_to: weekRange.to,
        task_count: weekSummary.length,
      },
    });
  }

  const created = [];
  for (const proposal of proposals) {
    const action = await createManagedAssistantAction(db, {
      userId: userProfile.id,
      actionType: proposal.actionType,
      riskLevel: proposal.riskLevel,
      title: proposal.title,
      summary: proposal.summary,
      payload: proposal.payload,
      dedupeKey: proposal.dedupeKey,
      sourceWorkflow: "proactive_scheduler",
    });

    if (action) {
      created.push(action);
    }
  }

  return {
    userId: userProfile.id,
    localDate: localClock.date,
    created,
  };
}

export async function dispatchProactiveJobs({ userId = null, userLimit = 50 } = {}) {
  await ensureMigrations();
  const now = new Date();

  const perUserResults = await withTransaction(async (db) => {
    const users = await listTargetUsers(db, {
      userId,
      limit: userLimit,
    });

    const results = [];
    for (const targetUser of users) {
      const profile =
        targetUser && targetUser.timezone
          ? targetUser
          : await loadUserProfileForPlanner(db, targetUser.id);
      const created = await createProposalsForUser(db, profile, now);
      results.push(created);
    }

    return results;
  });

  const autoActionIds = perUserResults
    .flatMap((item) => item.created)
    .filter((action) => action.mode === "auto" && action.status === "approved")
    .map((action) => action.id);

  const executionResults = [];
  for (const actionId of autoActionIds) {
    try {
      const result = await executeAssistantActionNow(actionId);
      executionResults.push({
        actionId,
        status: result?.status || "executed",
      });
    } catch (error) {
      executionResults.push({
        actionId,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const createdCount = perUserResults.reduce((count, item) => count + item.created.length, 0);
  const pendingApprovalCount = perUserResults
    .flatMap((item) => item.created)
    .filter((action) => action.status === "pending_approval").length;

  return {
    summary: {
      usersScanned: perUserResults.length,
      actionsCreated: createdCount,
      pendingApproval: pendingApprovalCount,
      autoExecuted: executionResults.filter((item) => item.status === "executed").length,
      autoFailed: executionResults.filter((item) => item.status === "failed").length,
    },
    details: {
      users: perUserResults.map((item) => ({
        userId: item.userId,
        localDate: item.localDate,
        actions: item.created.map((action) => ({
          id: action.id,
          actionType: action.actionType,
          mode: action.mode,
          status: action.status,
          title: action.title,
        })),
      })),
      executions: executionResults,
    },
  };
}
