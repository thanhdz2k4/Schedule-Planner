"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/daily", label: "Daily Timeline" },
  { href: "/goals", label: "Weekly Goals" },
  { href: "/analytics/week", label: "Weekly Stats" },
  { href: "/analytics/month", label: "Monthly Stats" },
  { href: "/analytics/year", label: "Yearly Stats" },
  { href: "/calendar", label: "Calendar View" },
  { href: "/focus", label: "Focus Mode" },
  { href: "/reminders", label: "Reminders" },
];

export default function AppShell({ title, subtitle, quote, goalProgress, themeLabel, onToggleTheme, children }) {
  const pathname = usePathname();

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
            <Link key={item.href} href={item.href} className={pathname === item.href ? "active" : ""}>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-card">
          <p>Goal tuần</p>
          <strong className="goal-value">{goalProgress}%</strong>
          <div className="progress mini">
            <span style={{ width: `${goalProgress}%` }} />
          </div>
          <small className="muted">Tiến độ tổng mục tiêu</small>
        </div>
      </aside>

      <main className="main">
        <header className="hero">
          <div className="hero-section">
            <p className="muted">Schedule Planner</p>
            <h2>{title}</h2>
          </div>
          <div className="hero-center hero-section">
            <h3>Weekly Schedule</h3>
            <p>{subtitle}</p>
          </div>
          <div className="hero-right hero-section">
            <p className="muted">Quote</p>
            <p className="quote">{quote || "Small progress every day."}</p>
            <button className="btn ghost" onClick={onToggleTheme}>
              {themeLabel}
            </button>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
