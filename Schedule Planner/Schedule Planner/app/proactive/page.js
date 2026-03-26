"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { loadAuthSession } from "@/lib/authClient";
import { usePlannerData } from "@/hooks/usePlannerData";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "pending_approval", label: "Pending approval" },
  { value: "approved", label: "Approved" },
  { value: "executed", label: "Executed" },
  { value: "failed", label: "Failed" },
  { value: "denied", label: "Denied" },
];

const ACTION_TYPE_LABELS = {
  daily_digest: "Daily digest",
  conflict_alert: "Conflict alert",
  risk_alert: "Risk alert",
  reschedule_chain: "Reschedule chain",
  plan_week: "Plan week",
};

function buildAuthHeaders(token, withJson = false) {
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (withJson) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function toFriendlyDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function actionTypeLabel(actionType) {
  if (!actionType) {
    return "Unknown";
  }

  return ACTION_TYPE_LABELS[actionType] || actionType;
}

export default function ProactivePlannerPage() {
  const { loaded, darkMode, state, actions } = usePlannerData();
  const [authSession, setAuthSession] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [policyDrafts, setPolicyDrafts] = useState({});
  const [actionRows, setActionRows] = useState([]);
  const [actionSummary, setActionSummary] = useState({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [busyId, setBusyId] = useState("");
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [loadingActions, setLoadingActions] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setAuthSession(loadAuthSession());
  }, []);

  const refreshPolicies = useCallback(async () => {
    if (!authSession?.token) {
      setPolicies([]);
      return;
    }

    setLoadingPolicies(true);
    try {
      const response = await fetch("/api/proactive/policies", {
        cache: "no-store",
        headers: buildAuthHeaders(authSession.token),
      });

      const payload = await safeJson(response);
      if (!response.ok) {
        setError(payload?.message || "Cannot load proactive policies.");
        return;
      }

      const nextPolicies = Array.isArray(payload?.policies) ? payload.policies : [];
      setPolicies(nextPolicies);
      setPolicyDrafts((prev) => {
        const next = { ...prev };
        for (const item of nextPolicies) {
          next[item.actionType] = item.mode;
        }
        return next;
      });
    } catch (requestError) {
      console.error(requestError);
      setError("Cannot connect to server while loading policies.");
    } finally {
      setLoadingPolicies(false);
    }
  }, [authSession?.token]);

  const refreshActions = useCallback(async () => {
    if (!authSession?.token) {
      setActionRows([]);
      setActionSummary({});
      return;
    }

    setLoadingActions(true);
    try {
      const query = new URLSearchParams({
        limit: "80",
      });
      if (statusFilter !== "all") {
        query.set("status", statusFilter);
      }

      const response = await fetch(`/api/proactive/actions?${query.toString()}`, {
        cache: "no-store",
        headers: buildAuthHeaders(authSession.token),
      });

      const payload = await safeJson(response);
      if (!response.ok) {
        setError(payload?.message || "Cannot load proactive actions.");
        return;
      }

      setActionRows(Array.isArray(payload?.actions) ? payload.actions : []);
      setActionSummary(payload?.summary && typeof payload.summary === "object" ? payload.summary : {});
    } catch (requestError) {
      console.error(requestError);
      setError("Cannot connect to server while loading actions.");
    } finally {
      setLoadingActions(false);
    }
  }, [authSession?.token, statusFilter]);

  useEffect(() => {
    refreshPolicies();
  }, [refreshPolicies]);

  useEffect(() => {
    refreshActions();
  }, [refreshActions]);

  const pendingCount = useMemo(() => {
    return actionRows.filter((item) => item.status === "pending_approval").length;
  }, [actionRows]);

  async function handleDispatchNow() {
    if (!authSession?.token) {
      setError("Please login first before running proactive planner.");
      return;
    }

    setBusyId("dispatch");
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/proactive/dispatch", {
        method: "POST",
        headers: buildAuthHeaders(authSession.token, true),
        body: JSON.stringify({ userLimit: 1 }),
      });

      const payload = await safeJson(response);
      if (!response.ok) {
        setError(payload?.message || "Cannot dispatch proactive planner.");
        return;
      }

      const summary = payload?.summary || {};
      setMessage(
        `Dispatch done: created=${summary.actionsCreated || 0}, pending=${summary.pendingApproval || 0}, executed=${summary.autoExecuted || 0}, failed=${summary.autoFailed || 0}.`
      );

      await refreshActions();
    } catch (dispatchError) {
      console.error(dispatchError);
      setError("Unexpected error while dispatching proactive planner.");
    } finally {
      setBusyId("");
    }
  }

  async function handleSavePolicy(actionType) {
    if (!authSession?.token) {
      setError("Please login first.");
      return;
    }

    const mode = policyDrafts[actionType];
    if (!mode) {
      setError("Invalid policy mode.");
      return;
    }

    setBusyId(`policy:${actionType}`);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/proactive/policies", {
        method: "PUT",
        headers: buildAuthHeaders(authSession.token, true),
        body: JSON.stringify({
          policies: [{ actionType, mode }],
        }),
      });

      const payload = await safeJson(response);
      if (!response.ok) {
        setError(payload?.message || "Cannot save proactive policy.");
        return;
      }

      const nextPolicies = Array.isArray(payload?.policies) ? payload.policies : [];
      setPolicies(nextPolicies);
      setMessage(`Saved policy: ${actionTypeLabel(actionType)} -> ${mode}.`);
    } catch (saveError) {
      console.error(saveError);
      setError("Unexpected error while saving policy.");
    } finally {
      setBusyId("");
    }
  }

  async function handleActionDecision(actionId, decision) {
    if (!authSession?.token) {
      setError("Please login first.");
      return;
    }

    setBusyId(`decision:${actionId}:${decision}`);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/proactive/actions/${actionId}/decision`, {
        method: "POST",
        headers: buildAuthHeaders(authSession.token, true),
        body: JSON.stringify({
          decision,
          executeNow: decision === "approve",
        }),
      });

      const payload = await safeJson(response);
      if (!response.ok) {
        setError(payload?.message || "Cannot update action decision.");
        return;
      }

      const status = payload?.action?.status || "updated";
      setMessage(`Action ${actionId.slice(0, 8)}... -> ${status}.`);
      await refreshActions();
    } catch (decisionError) {
      console.error(decisionError);
      setError("Unexpected error while updating action decision.");
    } finally {
      setBusyId("");
    }
  }

  async function handleExecuteNow(actionId) {
    if (!authSession?.token) {
      setError("Please login first.");
      return;
    }

    setBusyId(`execute:${actionId}`);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/proactive/actions/${actionId}/decision`, {
        method: "POST",
        headers: buildAuthHeaders(authSession.token, true),
        body: JSON.stringify({
          decision: "execute",
        }),
      });

      const payload = await safeJson(response);
      if (!response.ok) {
        setError(payload?.message || "Cannot execute proactive action.");
        return;
      }

      const status = payload?.action?.status || "updated";
      setMessage(`Execution done for ${actionId.slice(0, 8)}... -> ${status}.`);
      await refreshActions();
    } catch (executeError) {
      console.error(executeError);
      setError("Unexpected error while executing proactive action.");
    } finally {
      setBusyId("");
    }
  }

  async function handleDeleteAction(actionId) {
    if (!authSession?.token) {
      setError("Please login first.");
      return;
    }

    const confirmed = window.confirm("Delete this proactive action?");
    if (!confirmed) {
      return;
    }

    setBusyId(`delete:${actionId}`);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/proactive/actions/${actionId}`, {
        method: "DELETE",
        headers: buildAuthHeaders(authSession.token),
      });

      const payload = await safeJson(response);
      if (!response.ok) {
        setError(payload?.message || "Cannot delete proactive action.");
        return;
      }

      setMessage(`Deleted action ${actionId.slice(0, 8)}...`);
      await refreshActions();
    } catch (deleteError) {
      console.error(deleteError);
      setError("Unexpected error while deleting action.");
    } finally {
      setBusyId("");
    }
  }

  if (!loaded) {
    return null;
  }

  return (
    <AppShell
      title="Proactive Planner"
      subtitle="Auto planning actions, approval queue, and rescue flow"
      quote="Plan first, recover fast."
      goalProgress={state.goalOverall}
      themeLabel={darkMode ? "Che do sang" : "Che do toi"}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel">
        <div className="proactive-toolbar">
          <div>
            <h3>Planner Dispatch</h3>
            <p className="muted">Run proactive scan to generate digest, alerts, and approval actions.</p>
          </div>
          <button
            type="button"
            className="btn"
            onClick={handleDispatchNow}
            disabled={!authSession?.token || busyId === "dispatch"}
          >
            {busyId === "dispatch" ? "Running..." : "Run proactive now"}
          </button>
        </div>

        <div className="proactive-summary-grid">
          <div className="mini-card">
            <strong>Actions loaded</strong>
            <p>{actionRows.length}</p>
          </div>
          <div className="mini-card">
            <strong>Pending approval</strong>
            <p>{pendingCount}</p>
          </div>
          <div className="mini-card">
            <strong>Executed (current view)</strong>
            <p>{actionSummary.executed || 0}</p>
          </div>
          <div className="mini-card">
            <strong>Failed (current view)</strong>
            <p>{actionSummary.failed || 0}</p>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Policy Modes</h3>
          <p className="muted">Choose auto / ask / deny by action type.</p>
        </div>

        <div className="proactive-policy-grid">
          {policies.length ? (
            policies.map((item) => {
              const draftMode = policyDrafts[item.actionType] || item.mode;
              const isBusy = busyId === `policy:${item.actionType}`;

              return (
                <article key={item.id} className="proactive-policy-card">
                  <div>
                    <strong>{actionTypeLabel(item.actionType)}</strong>
                    <p className="muted">{item.actionType}</p>
                  </div>
                  <div className="proactive-policy-controls">
                    <select
                      value={draftMode}
                      onChange={(event) =>
                        setPolicyDrafts((prev) => ({
                          ...prev,
                          [item.actionType]: event.target.value,
                        }))
                      }
                    >
                      <option value="auto">auto</option>
                      <option value="ask">ask</option>
                      <option value="deny">deny</option>
                    </select>
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={!authSession?.token || isBusy}
                      onClick={() => handleSavePolicy(item.actionType)}
                    >
                      {isBusy ? "Saving..." : "Save"}
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="mini-card">
              {loadingPolicies ? "Loading policies..." : "No policy found. Run dispatch once to initialize."}
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="proactive-actions-head">
          <h3>Assistant Actions</h3>
          <div className="proactive-actions-filter-row">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={statusFilter === filter.value ? "active" : ""}
                onClick={() => setStatusFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="proactive-actions-list">
          {actionRows.length ? (
            actionRows.map((actionItem) => {
              const approveBusy = busyId === `decision:${actionItem.id}:approve`;
              const denyBusy = busyId === `decision:${actionItem.id}:deny`;
              const executeBusy = busyId === `execute:${actionItem.id}`;
              const deleteBusy = busyId === `delete:${actionItem.id}`;
              const canApprove = actionItem.status === "pending_approval";
              const canExecute = actionItem.status === "approved" || actionItem.status === "failed";

              return (
                <article key={actionItem.id} className={`proactive-action-card status-${actionItem.status}`}>
                  <div className="proactive-action-head">
                    <div>
                      <h4>{actionItem.title}</h4>
                      <p className="muted">
                        {actionTypeLabel(actionItem.actionType)} · risk={actionItem.riskLevel} · mode={actionItem.mode}
                      </p>
                    </div>
                    <span className={`badge proactive-status-pill status-${actionItem.status}`}>
                      {actionItem.status}
                    </span>
                  </div>

                  <p className="proactive-action-summary">{actionItem.summary}</p>

                  <div className="proactive-action-meta">
                    <span className="badge">Created: {toFriendlyDateTime(actionItem.createdAt)}</span>
                    {actionItem.executedAt ? (
                      <span className="badge">Executed: {toFriendlyDateTime(actionItem.executedAt)}</span>
                    ) : null}
                  </div>

                  <div className="proactive-action-buttons">
                    {canApprove ? (
                      <>
                        <button
                          type="button"
                          className="btn"
                          disabled={!authSession?.token || approveBusy}
                          onClick={() => handleActionDecision(actionItem.id, "approve")}
                        >
                          {approveBusy ? "Approving..." : "Approve + Execute"}
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          disabled={!authSession?.token || denyBusy}
                          onClick={() => handleActionDecision(actionItem.id, "deny")}
                        >
                          {denyBusy ? "Denying..." : "Deny"}
                        </button>
                      </>
                    ) : null}

                    {canExecute ? (
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={!authSession?.token || executeBusy}
                        onClick={() => handleExecuteNow(actionItem.id)}
                      >
                        {executeBusy ? "Executing..." : "Execute now"}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      className="btn ghost"
                      disabled={!authSession?.token || deleteBusy || actionItem.status === "executing"}
                      onClick={() => handleDeleteAction(actionItem.id)}
                    >
                      {deleteBusy ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="mini-card">
              {loadingActions ? "Loading actions..." : "No proactive action in this filter yet."}
            </div>
          )}
        </div>
      </section>

      {!authSession?.token ? (
        <p className="alert">Please login account first to use proactive planner controls.</p>
      ) : null}
      {error ? <p className="alert">{error}</p> : null}
      {!error && message ? <p className="integration-success">{message}</p> : null}
    </AppShell>
  );
}
