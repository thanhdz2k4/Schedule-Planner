"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { clearAuthSession, loadAuthSession, saveAuthSession } from "@/lib/authClient";
import { useUiLocale } from "@/hooks/useUiLocale";
import overviewIcon from "@/images/icons8-overview-100.png";
import timelineIcon from "@/images/icons8-timeline-100.png";
import goalsIcon from "@/images/icons8-goal-100.png";
import calendarIcon from "@/images/icons8-weekend-100.png";
import integrationsIcon from "@/images/telegram.png";

const NAV_ITEMS = [
  { href: "/", label: { vi: "Bảng điều khiển", en: "Dashboard" } },
  { href: "/daily", label: { vi: "Kế hoạch ngày", en: "Daily Plan" } },
  { href: "/goals", label: { vi: "Mục tiêu", en: "Goals" } },
  { href: "/calendar", label: { vi: "Lịch", en: "Calendar" } },
  { href: "/integrations", label: { vi: "Kết nối", en: "Integrations" } },
];

const NAV_ICON_BY_PATH = {
  "/": overviewIcon,
  "/daily": timelineIcon,
  "/goals": goalsIcon,
  "/calendar": calendarIcon,
  "/integrations": integrationsIcon,
};

const DEFAULT_FORM = { email: "", password: "" };

const COPY = {
  vi: {
    brandSub: "Lập kế hoạch · Theo dõi · Cải thiện",
    weeklyGoal: "Mục tiêu tuần",
    weeklyGoalSub: "Tiến độ hoàn thành tổng mục tiêu",
    account: "Tài khoản",
    loggedIn: "Đã đăng nhập",
    anonymous: "Ẩn danh",
    currentPlanSaved: "Lịch hiện tại đang lưu theo tài khoản này.",
    logout: "Đăng xuất",
    authTabLabel: "Chế độ tài khoản",
    login: "Đăng nhập",
    register: "Đăng ký",
    passwordPlaceholder: "Mật khẩu (ít nhất 8 ký tự)",
    authBusy: "Đang xử lý...",
    createAccount: "Tạo tài khoản",
    loginToSync: "Đăng nhập để lưu lịch theo tài khoản và dùng lại trên thiết bị khác.",
    heroKicker: "Schedule Planner",
    weekSchedule: "Lịch tuần",
    quoteLabel: "Trích dẫn",
    fallbackQuote: "Tiến bộ nhỏ mỗi ngày.",
    language: "Ngôn ngữ",
    languageAria: "Chuyển ngôn ngữ Việt hoặc Anh",
    lightMode: "Chế độ sáng",
    darkMode: "Chế độ tối",
    authFail: "Không thể xử lý đăng nhập.",
    invalidSession: "Dữ liệu phiên đăng nhập không hợp lệ.",
    authConnectedFail: "Không thể kết nối máy chủ.",
    registerSuccess: "Tạo tài khoản thành công.",
    loginSuccess: "Đăng nhập thành công.",
    logoutSuccess: "Đã đăng xuất.",
  },
  en: {
    brandSub: "Plan · Track · Improve",
    weeklyGoal: "Weekly Goal",
    weeklyGoalSub: "Overall progress toward goals",
    account: "Account",
    loggedIn: "Signed in",
    anonymous: "Anonymous",
    currentPlanSaved: "Current planner data is linked to this account.",
    logout: "Sign out",
    authTabLabel: "Account mode",
    login: "Sign in",
    register: "Register",
    passwordPlaceholder: "Password (at least 8 characters)",
    authBusy: "Processing...",
    createAccount: "Create account",
    loginToSync: "Sign in to sync planner data across devices.",
    heroKicker: "Schedule Planner",
    weekSchedule: "Weekly schedule",
    quoteLabel: "Quote",
    fallbackQuote: "Small progress every day.",
    language: "Language",
    languageAria: "Switch language between Vietnamese and English",
    lightMode: "Light mode",
    darkMode: "Dark mode",
    authFail: "Cannot process sign-in.",
    invalidSession: "Invalid session payload.",
    authConnectedFail: "Cannot connect to server.",
    registerSuccess: "Account created successfully.",
    loginSuccess: "Signed in successfully.",
    logoutSuccess: "Signed out.",
  },
};

function localeDateTag(locale) {
  return locale === "en" ? "en-US" : "vi-VN";
}

function pickLocalized(value, locale, fallback = "") {
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

  if (typeof value === "string") {
    return value;
  }

  return fallback;
}

function normalizeApiErrorMessage(payload, locale, copy) {
  const message = typeof payload?.message === "string" ? payload.message : "";
  const code = typeof payload?.code === "string" ? payload.code : "";

  if (locale !== "en") {
    return message || copy.authFail;
  }

  const byCode = {
    INVALID_PAYLOAD: "Invalid payload.",
    INVALID_EMAIL: "Invalid email format.",
    INVALID_PASSWORD: "Password must be 8-128 characters.",
    EMAIL_EXISTS: "Email is already in use.",
    INVALID_CREDENTIALS: "Incorrect email or password.",
    REGISTER_FAILED: "Cannot create account right now.",
    LOGIN_FAILED: "Cannot process sign-in.",
    SESSION_INVALID: "Session is invalid.",
  };

  if (code && byCode[code]) {
    return byCode[code];
  }

  if (!message) {
    return copy.authFail;
  }

  const legacyByMessage = {
    "Thiếu email hoặc mật khẩu.": "Missing email or password.",
    "Email không hợp lệ.": "Invalid email format.",
    "Mật khẩu phải có ít nhất 8 ký tự.": "Password must be at least 8 characters.",
    "Mật khẩu phải có từ 8 đến 128 ký tự.": "Password must be 8-128 characters.",
    "Email đã tồn tại.": "Email already exists.",
    "Email đã được sử dụng.": "Email is already in use.",
    "Email hoặc mật khẩu không đúng.": "Incorrect email or password.",
    "Session is invalid.": "Session is invalid.",
  };

  return legacyByMessage[message] || message;
}
async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export default function AppShell({
  title,
  subtitle,
  quote,
  goalProgress,
  themeLabel,
  onToggleTheme,
  children,
  hideHero = false,
  mainClassName = "",
}) {
  const pathname = usePathname();
  const [locale, setLocale] = useUiLocale();
  const [authSession, setAuthSession] = useState(() => (typeof window === "undefined" ? null : loadAuthSession()));
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState(DEFAULT_FORM);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");
  const copy = COPY[locale] || COPY.vi;

  const localizedTitle = pickLocalized(title, locale);
  const localizedSubtitle = pickLocalized(subtitle, locale);
  const localizedQuote = pickLocalized(quote, locale, copy.fallbackQuote);
  const localizedThemeLabel = pickLocalized(
    themeLabel,
    locale,
    typeof themeLabel === "string" ? themeLabel : copy.darkMode
  );

  const todayText = useMemo(
    () =>
      new Date().toLocaleDateString(localeDateTag(locale), {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
    [locale]
  );

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
        setAuthError(normalizeApiErrorMessage(payload, locale, copy) || copy.authFail);
        return;
      }

      if (!payload?.session?.token || !payload?.session?.userId || !payload?.session?.email) {
        setAuthError(copy.invalidSession);
        return;
      }

      saveAuthSession(payload.session);
      setAuthSession(payload.session);
      setAuthForm(DEFAULT_FORM);
      setAuthInfo(authMode === "register" ? copy.registerSuccess : copy.loginSuccess);
      window.location.reload();
    } catch (error) {
      console.error(error);
      setAuthError(copy.authConnectedFail);
    } finally {
      setAuthBusy(false);
    }
  }

  function handleLogout() {
    clearAuthSession();
    setAuthSession(null);
    setAuthError("");
    setAuthInfo(copy.logoutSuccess);
    window.location.reload();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-dot" />
          <div>
            <h3>Schedule Planner</h3>
            <p className="muted">{copy.brandSub}</p>
          </div>
        </div>

        <button
          type="button"
          className={`lang-switch-btn${locale === "en" ? " is-en" : ""}`}
          aria-label={copy.languageAria}
          title={copy.language}
          onClick={() => setLocale((prev) => (prev === "vi" ? "en" : "vi"))}
        >
          <span className="lang-switch-track">
            <span className="lang-switch-thumb" />
          </span>
          <span className="lang-switch-value">{locale.toUpperCase()}</span>
        </button>

        <nav>
          {NAV_ITEMS.map((item) => {
            const iconImage = NAV_ICON_BY_PATH[item.href];
            const isActive =
              pathname === item.href ||
              pathname.startsWith(`${item.href}/`) ||
              (Array.isArray(item.aliases) &&
                item.aliases.some((alias) => pathname === alias || pathname.startsWith(`${alias}/`)));

            return (
              <Link key={item.href} href={item.href} className={isActive ? "active" : ""}>
                <span className="nav-link-content">
                  {iconImage ? <Image src={iconImage} alt="" className="nav-link-icon" width={16} height={16} /> : null}
                  <span className="nav-link-label">{pickLocalized(item.label, locale)}</span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-card">
          <p>{copy.weeklyGoal}</p>
          <strong className="goal-value">{goalProgress}%</strong>
          <div className="progress mini">
            <span style={{ width: `${goalProgress}%` }} />
          </div>
          <small className="muted">{copy.weeklyGoalSub}</small>
        </div>

        <section className="auth-card">
          <div className="auth-head">
            <p>{copy.account}</p>
            {authSession ? <span className="auth-state">{copy.loggedIn}</span> : <span className="auth-state">{copy.anonymous}</span>}
          </div>

          {authSession ? (
            <>
              <strong className="auth-email">{authSession.email}</strong>
              <p className="muted auth-note">{copy.currentPlanSaved}</p>
              <button className="btn auth-action" type="button" onClick={handleLogout}>
                {copy.logout}
              </button>
            </>
          ) : (
            <>
              <div className="auth-tabs" role="tablist" aria-label={copy.authTabLabel}>
                <button
                  type="button"
                  className={`auth-tab${authMode === "login" ? " active" : ""}`}
                  onClick={() => setAuthMode("login")}
                >
                  {copy.login}
                </button>
                <button
                  type="button"
                  className={`auth-tab${authMode === "register" ? " active" : ""}`}
                  onClick={() => setAuthMode("register")}
                >
                  {copy.register}
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
                  placeholder={copy.passwordPlaceholder}
                  minLength={8}
                  value={authForm.password}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, password: event.target.value }))}
                  required
                />
                <button className="btn auth-action" type="submit" disabled={authBusy}>
                  {authBusy ? copy.authBusy : authMode === "register" ? copy.createAccount : copy.login}
                </button>
              </form>
              <p className="muted auth-note">{copy.loginToSync}</p>
            </>
          )}

          {authError ? <p className="auth-error">{authError}</p> : null}
          {!authError && authInfo ? <p className="auth-info">{authInfo}</p> : null}
        </section>
      </aside>

      <main className={`main${mainClassName ? ` ${mainClassName}` : ""}`}>
        {!hideHero ? (
          <header className="hero">
            <div className="hero-section">
              <p className="muted hero-kicker">{copy.heroKicker}</p>
              <h2>{localizedTitle}</h2>
              <p className="muted hero-sub">{localizedSubtitle}</p>
            </div>
            <div className="hero-center hero-section">
              <h3>{copy.weekSchedule}</h3>
              <p className="hero-meta">{todayText}</p>
            </div>
            <div className="hero-right hero-section">
              <p className="muted">{copy.quoteLabel}</p>
              <p className="quote">{localizedQuote}</p>
              <button className="btn ghost theme-toggle" onClick={onToggleTheme}>
                {localizedThemeLabel}
              </button>
            </div>
          </header>
        ) : null}

        {children}
      </main>
    </div>
  );
}
