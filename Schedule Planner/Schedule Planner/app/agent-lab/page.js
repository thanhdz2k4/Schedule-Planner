"use client";

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { formatShortUserId, rotateAnonymousUserId } from "@/lib/anonymousUser";
import { usePlannerData } from "@/hooks/usePlannerData";

const PROVIDERS = [
  { value: "auto", label: "Auto" },
  { value: "mistral", label: "Mistral" },
  { value: "rule", label: "Rule" },
];

function resultSummary(result) {
  if (!result) return "";
  if (result.need_clarification) {
    return result.clarifying_question || "Cần bổ sung thêm thông tin.";
  }

  return `Intent: ${result.intent} · Confidence: ${Math.round((result.confidence || 0) * 100)}%`;
}

export default function AgentLabPage() {
  const { loaded, darkMode, userId, state, actions } = usePlannerData();
  const [provider, setProvider] = useState("auto");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [context, setContext] = useState(null);
  const [history, setHistory] = useState([]);

  const shortUserId = useMemo(() => formatShortUserId(userId), [userId]);
  const latestResult = useMemo(() => {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      if (history[i].result) {
        return history[i].result;
      }
    }

    return null;
  }, [history]);

  if (!loaded) {
    return null;
  }

  async function submitPrompt(event) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !userId || busy) {
      return;
    }

    setBusy(true);
    setError("");
    setText("");
    setHistory((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: trimmed }]);

    try {
      const response = await fetch("/api/agent/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          provider,
          text: trimmed,
          context,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message || "Không thể gọi router.");
      }

      const nextContext = payload.context_for_next_turn || null;
      setContext(nextContext);
      setHistory((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: resultSummary(payload),
          result: payload,
        },
      ]);
    } catch (submitError) {
      setError(String(submitError?.message || submitError));
      setHistory((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "Router bị lỗi, xem chi tiết ở alert bên trên.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function resetConversation() {
    setContext(null);
    setError("");
    setHistory([]);
  }

  function switchAnonymousIdentity() {
    rotateAnonymousUserId();
    window.location.reload();
  }

  return (
    <AppShell
      title="Agent Lab"
      subtitle="Test intern-router nhiều lượt trực tiếp trên web"
      quote="Fast feedback beats assumptions."
      goalProgress={state.goalOverall}
      themeLabel={darkMode ? "Chế độ sáng" : "Chế độ tối"}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Chat Router Test</h3>
            <p className="muted">Mỗi browser có 1 anonymous user id để tách dữ liệu.</p>
          </div>
          <span className="badge">User: {shortUserId}</span>
        </div>

        <div className="agent-toolbar">
          <button type="button" className="btn ghost" onClick={resetConversation}>Reset context</button>
          <button type="button" className="btn ghost" onClick={switchAnonymousIdentity}>Đổi user test</button>
        </div>

        <form className="agent-form" onSubmit={submitPrompt}>
          <select value={provider} onChange={(event) => setProvider(event.target.value)}>
            {PROVIDERS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Ví dụ: Tạo task họp sprint hôm nay 9 giờ sáng"
            rows={3}
            required
          />
          <button type="submit" className="btn" disabled={busy}>{busy ? "Đang gửi..." : "Gửi router"}</button>
        </form>

        {error ? <p className="alert">{error}</p> : null}
      </section>

      <section className="panel two-col">
        <article>
          <div className="panel-head">
            <h3>Hội thoại</h3>
          </div>
          <div className="agent-history">
            {history.length ? (
              history.map((item) => (
                <div
                  key={item.id}
                  className={`agent-bubble ${item.role === "user" ? "agent-bubble-user" : "agent-bubble-assistant"}`}
                >
                  <p className="muted">{item.role === "user" ? "Bạn" : "Router"}</p>
                  <p>{item.text}</p>
                </div>
              ))
            ) : (
              <div className="mini-card">Chưa có hội thoại. Gửi câu đầu tiên để bắt đầu.</div>
            )}
          </div>
        </article>

        <article>
          <div className="panel-head">
            <h3>Kết quả JSON mới nhất</h3>
          </div>
          {latestResult ? (
            <pre className="agent-json">{JSON.stringify(latestResult, null, 2)}</pre>
          ) : (
            <div className="mini-card">Chưa có response.</div>
          )}
        </article>
      </section>
    </AppShell>
  );
}

