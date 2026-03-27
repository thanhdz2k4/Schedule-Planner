import Link from "next/link";
import styles from "../_shared/legal.module.css";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@schedule-planner.local";
const LAST_UPDATED = "March 27, 2026";

export const metadata = {
  title: "Schedule Planner | Terms of Service",
  description: "Terms of Service for Schedule Planner.",
};

export default function TermsOfServicePage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.hero}>
          <p className={styles.kicker}>Application Terms of Service</p>
          <h1 className={styles.title}>Terms of Service</h1>
          <p className={styles.subtitle}>
            These terms govern use of Schedule Planner and related integrations.
          </p>
          <div className={styles.meta}>
            <span className={styles.pill}>Effective date: {LAST_UPDATED}</span>
            <span className={styles.pill}>Contact: {SUPPORT_EMAIL}</span>
          </div>
        </header>

        <section className={styles.content}>
          <article className={styles.section}>
            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing or using Schedule Planner, you agree to these Terms of Service and applicable laws and
              regulations.
            </p>
          </article>

          <article className={styles.section}>
            <h2>2. User Responsibilities</h2>
            <ul>
              <li>Provide accurate information when creating and maintaining your account.</li>
              <li>Keep your credentials and connected integrations secure.</li>
              <li>Use the service only for lawful purposes.</li>
            </ul>
          </article>

          <article className={styles.section}>
            <h2>3. Integrations and Third-Party Services</h2>
            <p>
              Schedule Planner may connect to third-party services such as Google Gmail and Telegram. Your use of
              those services remains subject to their own terms and privacy policies.
            </p>
          </article>

          <article className={styles.section}>
            <h2>4. Prohibited Use</h2>
            <p>
              You may not misuse the service, attempt unauthorized access, disrupt platform operations, or use the
              service for spam, abuse, or unlawful data processing.
            </p>
          </article>

          <article className={styles.section}>
            <h2>5. Service Availability and Changes</h2>
            <p>
              We may improve, modify, or discontinue features from time to time. We do not guarantee uninterrupted
              availability in all environments.
            </p>
          </article>

          <article className={styles.section}>
            <h2>6. Limitation of Liability</h2>
            <p>
              To the extent allowed by law, Schedule Planner is provided on an &quot;as is&quot; basis without warranties of any
              kind, and liability is limited for indirect or consequential damages.
            </p>
          </article>

          <article className={styles.section}>
            <h2>7. Termination</h2>
            <p>
              We may suspend or terminate access for violations of these terms. Users may stop using the service at
              any time and request data deletion via {SUPPORT_EMAIL}.
            </p>
          </article>

          <article className={styles.section}>
            <h2>8. Contact</h2>
            <p>For legal or support inquiries, contact {SUPPORT_EMAIL}.</p>
            <div className={styles.links}>
              <Link className={styles.linkBtnGhost} href="/application-home">
                Application Home
              </Link>
              <Link className={styles.linkBtn} href="/privacy-policy">
                Privacy Policy
              </Link>
            </div>
          </article>
        </section>

        <footer className={styles.footer}>
          <span>Schedule Planner Terms of Service</span>
          <span>Last updated: {LAST_UPDATED}</span>
        </footer>
      </div>
    </main>
  );
}
