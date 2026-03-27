"use client";

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { formatShortUserId, rotateAnonymousUserId } from "@/lib/anonymousUser";
import { usePlannerData } from "@/hooks/usePlannerData";
import { useUiLocale } from "@/hooks/useUiLocale";

const PROVIDERS = [
  { value: "auto", label: "Auto" },
  { value: "mistral", label: "Mistral" },
  { value: "rule", label: "Rule" },
];

const RUN_MODES = [
  { value: "workflow", label: { vi: "Định tuyến + Thực thi", en: "Route + Execute" } },
  { value: "route", label: { vi: "Chỉ định tuyến", en: "Route only" } },
];

const COPY = {
  vi: {
    needMoreInfo: "Cần bổ sung thêm thông tin.",
    workflowFailed: "Workflow không thể chạy.",
    callRouterFailed: "Không thể gọi router.",
    routerErrorHint: "Router bị lỗi, xem chi tiết ở cảnh báo bên trên.",
    title: "Phòng Thí Nghiệm Agent",
    subtitle: "Test intern-router nhiều lượt trực tiếp trên web",
    quote: "Phản hồi nhanh luôn tốt hơn giả định.",
    panelTitle: "Chat Router Test",
    panelSub: "Mỗi browser có 1 anonymous user id để tách dữ liệu.",
    userLabel: "User",
    resetContext: "Reset context",
    switchTestUser: "Đổi user test",
    promptPlaceholder: "Ví dụ: Tạo task họp sprint hôm nay 9 giờ sáng",
    sending: "Đang gửi...",
    sendRouter: "Gửi router",
    conversation: "Hội thoại",
    you: "Bạn",
    router: "Router",
    emptyConversation: "Chưa có hội thoại. Gửi câu đầu tiên để bắt đầu.",
    latestJson: "Kết quả JSON mới nhất",
    noResponse: "Chưa có response.",
    htmlToolTitle: "Công Cụ Text -> HTML",
    htmlToolSub: "Dán câu trả lời AI để convert sang Telegram HTML dễ đọc.",
    htmlInputPlaceholder: "Dán text AI vào đây để chuyển sang HTML...",
    useLatestReply: "Lấy câu trả lời mới nhất",
    convertHtml: "Chuyển HTML",
    convertingHtml: "Đang chuyển...",
    noHtml: "Chưa có HTML output.",
    callHtmlToolFailed: "Không thể gọi công cụ HTML.",
    intent: "Intent",
    confidence: "Độ tin cậy",
    themeLight: "Chế độ sáng",
    themeDark: "Chế độ tối",
  },
  en: {
    needMoreInfo: "More details are needed.",
    workflowFailed: "Workflow cannot run.",
    callRouterFailed: "Cannot call router.",
    routerErrorHint: "Router failed. See the alert above for details.",
    title: "Agent Lab",
    subtitle: "Test intern-router multi-turn directly on web",
    quote: "Fast feedback beats assumptions.",
    panelTitle: "Chat Router Test",
    panelSub: "Each browser has one anonymous user id to isolate data.",
    userLabel: "User",
    resetContext: "Reset context",
    switchTestUser: "Switch test user",
    promptPlaceholder: "Example: Create a sprint meeting task today at 9 AM",
    sending: "Sending...",
    sendRouter: "Send router",
    conversation: "Conversation",
    you: "You",
    router: "Router",
    emptyConversation: "No conversation yet. Send the first prompt to start.",
    latestJson: "Latest JSON result",
    noResponse: "No response yet.",
    htmlToolTitle: "Text -> HTML Tool",
    htmlToolSub: "Paste AI text and convert it into readable Telegram HTML.",
    htmlInputPlaceholder: "Paste AI text here to convert to HTML...",
    useLatestReply: "Use latest reply",
    convertHtml: "Convert HTML",
    convertingHtml: "Converting...",
    noHtml: "No HTML output yet.",
    callHtmlToolFailed: "Cannot call HTML tool.",
    intent: "Intent",
    confidence: "Confidence",
    themeLight: "Light mode",
    themeDark: "Dark mode",
  },
};

function pickLocalized(value, locale) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (typeof value[locale] === "string") {
      return value[locale];
    }

    if (typeof value.vi === "string") {
      return value.vi;
    }

    if (typeof value.en === "string") {
      return value.en;
    }
  }

  return typeof value === "string" ? value : "";
}

function resultSummary(result, runMode, copy) {
  if (!result) return "";

  if (runMode === "workflow") {
    if (result.ok && result.execution?.result?.message) {
      return result.execution.result.message;
    }
    if (!result.ok && result.stage === "routing") {
      return result.message || result.route?.clarifying_question || copy.needMoreInfo;
    }
    return result.execution?.error?.message || copy.workflowFailed;
  }

  if (result.need_clarification) {
    return result.clarifying_question || copy.needMoreInfo;
  }

  return `${copy.intent}: ${result.intent} · ${copy.confidence}: ${Math.round((result.confidence || 0) * 100)}%`;
}

export default function AgentLabPage() {
  const { loaded, darkMode, userId, state, actions } = usePlannerData();
  const [locale] = useUiLocale();
  const copy = COPY[locale] || COPY.vi;

  const [runMode, setRunMode] = useState("workflow");
  const [provider, setProvider] = useState("auto");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [context, setContext] = useState(null);
  const [history, setHistory] = useState([]);
  const [htmlInput, setHtmlInput] = useState("");
  const [htmlOutput, setHtmlOutput] = useState("");
  const [htmlBusy, setHtmlBusy] = useState(false);
  const [htmlError, setHtmlError] = useState("");

  const runModeOptions = useMemo(
    () =>
      RUN_MODES.map((item) => ({
        value: item.value,
        label: pickLocalized(item.label, locale),
      })),
    [locale]
  );

  const shortUserId = useMemo(() => formatShortUserId(userId), [userId]);
  const latestResult = useMemo(() => {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      if (history[i].result) {
        return history[i].result;
      }
    }

    return null;
  }, [history]);

  const latestAssistantReply = useMemo(() => {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      if (history[i].role === "assistant" && typeof history[i].text === "string" && history[i].text.trim()) {
        return history[i].text.trim();
      }
    }
    return "";
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
      const endpoint = runMode === "workflow" ? "/api/agent/workflow/execute" : "/api/agent/route";
      const response = await fetch(endpoint, {
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
        throw new Error(payload?.message || copy.callRouterFailed);
      }

      const nextContext = payload?.context_for_next_turn || payload?.route?.context_for_next_turn || null;
      setContext(nextContext);
      setHistory((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: resultSummary(payload, runMode, copy),
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
          text: copy.routerErrorHint,
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

  function useLatestAssistantReply() {
    if (!latestAssistantReply) {
      return;
    }
    setHtmlInput(latestAssistantReply);
    setHtmlError("");
  }

  async function submitHtmlTool(event) {
    event.preventDefault();
    const trimmed = htmlInput.trim();
    if (!trimmed || htmlBusy) {
      return;
    }

    setHtmlBusy(true);
    setHtmlError("");

    try {
      const response = await fetch("/api/tools/text-to-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message || copy.callHtmlToolFailed);
      }
      setHtmlOutput(typeof payload?.html === "string" ? payload.html : "");
    } catch (convertError) {
      setHtmlError(String(convertError?.message || convertError));
    } finally {
      setHtmlBusy(false);
    }
  }

  return (
    <AppShell
      title={{ vi: copy.title, en: "Agent Lab" }}
      subtitle={{ vi: copy.subtitle, en: "Test intern-router multi-turn directly on web" }}
      quote={{ vi: copy.quote, en: "Fast feedback beats assumptions." }}
      goalProgress={state.goalOverall}
      themeLabel={darkMode ? { vi: copy.themeLight, en: "Light mode" } : { vi: copy.themeDark, en: "Dark mode" }}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>{copy.panelTitle}</h3>
            <p className="muted">{copy.panelSub}</p>
          </div>
          <span className="badge">
            {copy.userLabel}: {shortUserId}
          </span>
        </div>

        <div className="agent-toolbar">
          <button type="button" className="btn ghost" onClick={resetConversation}>
            {copy.resetContext}
          </button>
          <button type="button" className="btn ghost" onClick={switchAnonymousIdentity}>
            {copy.switchTestUser}
          </button>
        </div>

        <form className="agent-form" onSubmit={submitPrompt}>
          <select value={runMode} onChange={(event) => setRunMode(event.target.value)}>
            {runModeOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select value={provider} onChange={(event) => setProvider(event.target.value)}>
            {PROVIDERS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={copy.promptPlaceholder}
            rows={3}
            required
          />
          <button type="submit" className="btn" disabled={busy}>
            {busy ? copy.sending : copy.sendRouter}
          </button>
        </form>

        {error ? <p className="alert">{error}</p> : null}
      </section>

      <section className="panel two-col">
        <article>
          <div className="panel-head">
            <h3>{copy.conversation}</h3>
          </div>
          <div className="agent-history">
            {history.length ? (
              history.map((item) => (
                <div
                  key={item.id}
                  className={`agent-bubble ${item.role === "user" ? "agent-bubble-user" : "agent-bubble-assistant"}`}
                >
                  <p className="muted">{item.role === "user" ? copy.you : copy.router}</p>
                  <p>{item.text}</p>
                </div>
              ))
            ) : (
              <div className="mini-card">{copy.emptyConversation}</div>
            )}
          </div>
        </article>

        <article>
          <div className="panel-head">
            <h3>{copy.latestJson}</h3>
          </div>
          {latestResult ? (
            <pre className="agent-json">{JSON.stringify(latestResult, null, 2)}</pre>
          ) : (
            <div className="mini-card">{copy.noResponse}</div>
          )}
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>{copy.htmlToolTitle}</h3>
            <p className="muted">{copy.htmlToolSub}</p>
          </div>
          <button type="button" className="btn ghost" onClick={useLatestAssistantReply} disabled={!latestAssistantReply}>
            {copy.useLatestReply}
          </button>
        </div>

        <form className="agent-html-form" onSubmit={submitHtmlTool}>
          <textarea
            value={htmlInput}
            onChange={(event) => setHtmlInput(event.target.value)}
            placeholder={copy.htmlInputPlaceholder}
            rows={5}
            required
          />
          <button type="submit" className="btn" disabled={htmlBusy}>
            {htmlBusy ? copy.convertingHtml : copy.convertHtml}
          </button>
        </form>

        {htmlError ? <p className="alert">{htmlError}</p> : null}

        {htmlOutput ? (
          <pre className="agent-json agent-json-wrap">{htmlOutput}</pre>
        ) : (
          <div className="mini-card">{copy.noHtml}</div>
        )}
      </section>
    </AppShell>
  );
}
