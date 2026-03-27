import Link from "next/link";
import styles from "../_shared/legal.module.css";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@schedule-planner.local";
const LAST_UPDATED = "March 27, 2026";

export const metadata = {
  title: "Schedule Planner | Application Home",
  description: "Application home page for Schedule Planner integrations.",
};

export default function ApplicationHomePage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.hero}>
          <p className={styles.kicker}>Application Home Page</p>
          <h1 className={styles.title}>Schedule Planner</h1>
          <p className={styles.subtitle}>
            Schedule Planner helps users plan tasks, receive reminders, and manage productivity workflows across
            integrations like Gmail and Telegram.
          </p>
          <div className={styles.meta}>
            <span className={styles.pill}>Service: Personal Productivity</span>
            <span className={styles.pill}>Contact: {SUPPORT_EMAIL}</span>
            <span className={styles.pill}>Updated: {LAST_UPDATED}</span>
          </div>
        </header>

        <section className={styles.content}>
          <article className={styles.section}>
            <h2>What This App Does</h2>
            <ul>
              <li>Create, update, and organize daily tasks and goals.</li>
              <li>Send reminder messages to connected channels (Gmail, Telegram).</li>
              <li>Assist users through chat-based planning workflows.</li>
            </ul>
          </article>

          <article className={styles.section}>
            <h2>How Google Data Is Used</h2>
            <p>
              If a user connects Gmail, Schedule Planner uses Gmail access only to send reminder emails requested by
              that user. We do not sell Google user data and do not use Gmail data for advertising.
            </p>
          </article>

          <article className={styles.section}>
            <h2>Legal Links</h2>
            <div className={styles.links}>
              <Link className={styles.linkBtn} href="/privacy-policy">
                Privacy Policy
              </Link>
              <Link className={styles.linkBtnGhost} href="/terms-of-service">
                Terms of Service
              </Link>
            </div>
          </article>
        </section>

        <footer className={styles.footer}>
          <span>Schedule Planner</span>
          <span>Email support: {SUPPORT_EMAIL}</span>
        </footer>
      </div>
    </main>
  );
}
