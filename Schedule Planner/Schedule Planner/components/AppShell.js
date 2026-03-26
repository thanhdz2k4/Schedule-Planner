"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clearAuthSession, loadAuthSession, saveAuthSession } from "@/lib/authClient";

const NAV_ITEMS = [
  { href: "/", label: "Tổng quan" },
  { href: "/daily", label: "Timeline ngày" },
  { href: "/goals", label: "Goal tuần" },
  { href: "/analytics/week", label: "Thống kê tuần" },
  { href: "/analytics/month", label: "Thống kê tháng" },
  { href: "/analytics/year", label: "Thống kê năm" },
  { href: "/calendar", label: "Lịch tháng" },
  { href: "/focus", label: "Tập trung" },
  { href: "/reminders", label: "Nhắc việc" },
  { href: "/agent-lab", label: "Agent Lab" },
];

const DEFAULT_FORM = { email: "", password: "" };

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export default function AppShell({ title, subtitle, quote, goalProgress, themeLabel, onToggleTheme, children }) {
  const pathname = usePathname();
  const [authSession, setAuthSession] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState(DEFAULT_FORM);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");

  useEffect(() => {
    setAuthSession(loadAuthSession());
  }, [pathname]);

  const todayText = new Date().toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  async function handleAuthSubmit(event) {
    event.preventDefault();
    if (authBusy) {
      return;
    }

    setAuthBusy(true);
    setAuthError("");
    setAuthInfo("");

    try {
      const endpoint = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authForm),
      });

      const payload = await safeJson(response);
      if (!response.ok) {
        setAuthError(payload?.message || "Không thể xử lý đăng nhập.");
        return;
      }

      if (!payload?.session?.token || !payload?.session?.userId || !payload?.session?.email) {
        setAuthError("Dữ liệu phiên đăng nhập không hợp lệ.");
        return;
      }

      saveAuthSession(payload.session);
      setAuthSession(payload.session);
      setAuthForm(DEFAULT_FORM);
      setAuthInfo(authMode === "register" ? "Tạo tài khoản thành công." : "Đăng nhập thành công.");

      window.location.reload();
    } catch (error) {
      console.error(error);
      setAuthError("Không thể kết nối máy chủ.");
    } finally {
      setAuthBusy(false);
    }
  }

  function handleLogout() {
    clearAuthSession();
    setAuthSession(null);
    setAuthError("");
    setAuthInfo("Đã đăng xuất.");
    window.location.reload();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-dot" />
          <div>
            <h1>Schedule Planner</h1>
            <p className="muted">Plan · Track · Improve</p>
          </div>
        </div>
        <nav>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname === item.href || pathname.startsWith(`${item.href}/`) ? "active" : ""}
            >
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-card">
          <p>Mục tiêu tuần</p>
          <strong className="goal-value">{goalProgress}%</strong>
          <div className="progress mini">
            <span style={{ width: `${goalProgress}%` }} />
          </div>
          <small className="muted">Tiến độ hoàn thành tổng mục tiêu</small>
        </div>

        <section className="auth-card">
          <div className="auth-head">
            <p>Tài khoản</p>
            {authSession ? <span className="auth-state">Đã đăng nhập</span> : <span className="auth-state">Ẩn danh</span>}
          </div>

          {authSession ? (
            <>
              <strong className="auth-email">{authSession.email}</strong>
              <p className="muted auth-note">Lịch hiện tại đang lưu theo tài khoản này.</p>
              <button className="btn auth-action" type="button" onClick={handleLogout}>
                Đăng xuất
              </button>
            </>
          ) : (
            <>
              <div className="auth-tabs" role="tablist" aria-label="Chế độ tài khoản">
                <button
                  type="button"
                  className={`auth-tab${authMode === "login" ? " active" : ""}`}
                  onClick={() => setAuthMode("login")}
                >
                  Đăng nhập
                </button>
                <button
                  type="button"
                  className={`auth-tab${authMode === "register" ? " active" : ""}`}
                  onClick={() => setAuthMode("register")}
                >
                  Đăng ký
                </button>
              </div>
              <form className="auth-form" onSubmit={handleAuthSubmit}>
                <input
                  type="email"
                  placeholder="Email"
                  value={authForm.email}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, email: event.target.value }))}
                  required
                />
                <input
                  type="password"
                  placeholder="Mật khẩu (ít nhất 8 ký tự)"
                  minLength={8}
                  value={authForm.password}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, password: event.target.value }))}
                  required
                />
                <button className="btn auth-action" type="submit" disabled={authBusy}>
                  {authBusy ? "Đang xử lý..." : authMode === "register" ? "Tạo tài khoản" : "Đăng nhập"}
                </button>
              </form>
              <p className="muted auth-note">Đăng nhập để lưu lịch theo tài khoản và dùng lại trên thiết bị khác.</p>
            </>
          )}

          {authError ? <p className="auth-error">{authError}</p> : null}
          {!authError && authInfo ? <p className="auth-info">{authInfo}</p> : null}
        </section>
      </aside>

      <main className="main">
        <header className="hero">
          <div className="hero-section">
            <p className="muted hero-kicker">Schedule Planner</p>
            <h2>{title}</h2>
            <p className="muted hero-sub">{subtitle}</p>
          </div>
          <div className="hero-center hero-section">
            <h3>Lịch tuần</h3>
            <p className="hero-meta">{todayText}</p>
          </div>
          <div className="hero-right hero-section">
            <p className="muted">Trích dẫn</p>
            <p className="quote">{quote || "Small progress every day."}</p>
            <button className="btn ghost theme-toggle" onClick={onToggleTheme}>
              {themeLabel}
            </button>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
