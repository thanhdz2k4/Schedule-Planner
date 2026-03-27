import Link from "next/link";
import styles from "../_shared/legal.module.css";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@schedule-planner.local";
const LAST_UPDATED = "March 27, 2026";

export const metadata = {
  title: "Schedule Planner | Privacy Policy",
  description: "Privacy Policy for Schedule Planner.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.hero}>
          <p className={styles.kicker}>Application Privacy Policy</p>
          <h1 className={styles.title}>Privacy Policy</h1>
          <p className={styles.subtitle}>
            This policy explains how Schedule Planner collects, uses, stores, and protects user information.
          </p>
          <div className={styles.meta}>
            <span className={styles.pill}>Effective date: {LAST_UPDATED}</span>
            <span className={styles.pill}>Contact: {SUPPORT_EMAIL}</span>
          </div>
        </header>

        <section className={styles.content}>
          <article className={styles.section}>
            <h2>1. Information We Collect</h2>
            <ul>
              <li>Account data such as email and basic profile metadata.</li>
              <li>Planner data provided by users: tasks, goals, reminders, and chat messages.</li>
              <li>Integration metadata required to send notifications via connected services.</li>
            </ul>
          </article>

          <article className={styles.section}>
            <h2>2. How We Use Google User Data</h2>
            <p>
              When users connect Gmail, Schedule Planner accesses Google data only for features the user requests,
              primarily sending reminder emails on the user&apos;s behalf.
            </p>
            <p>
              Schedule Planner does not sell Google user data, does not use Google user data for advertising, and does
              not share Google user data with unauthorized third parties.
            </p>
          </article>

          <article className={styles.section}>
            <h2>3. Data Sharing and Third Parties</h2>
            <p>
              We may use service providers for infrastructure and delivery. These providers receive only the minimum
              information required to operate the service.
            </p>
          </article>

          <article className={styles.section}>
            <h2>4. Data Retention and Deletion</h2>
            <p>
              We keep data while users maintain an active account or until deletion is requested. Users may request
              data deletion by contacting {SUPPORT_EMAIL}.
            </p>
          </article>

          <article className={styles.section}>
            <h2>5. Security</h2>
            <p>
              We apply reasonable technical and organizational safeguards to protect user information against
              unauthorized access, loss, and misuse.
            </p>
          </article>

          <article className={styles.section}>
            <h2>6. Changes to This Policy</h2>
            <p>
              We may update this policy periodically. Material changes will be reflected by updating the effective
              date on this page.
            </p>
          </article>

          <article className={styles.section}>
            <h2>7. Contact</h2>
            <p>If you have questions about this Privacy Policy, contact us at {SUPPORT_EMAIL}.</p>
            <div className={styles.links}>
              <Link className={styles.linkBtnGhost} href="/application-home">
                Application Home
              </Link>
              <Link className={styles.linkBtn} href="/terms-of-service">
                Terms of Service
              </Link>
            </div>
          </article>
        </section>

        <footer className={styles.footer}>
          <span>Schedule Planner Privacy Policy</span>
          <span>Last updated: {LAST_UPDATED}</span>
        </footer>
      </div>
    </main>
  );
}
