"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
];

export default function AppShell({ title, subtitle, quote, goalProgress, themeLabel, onToggleTheme, children }) {
  const pathname = usePathname();
  const todayText = new Date().toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

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
