export const metadata = {
  title:       'Privacy Policy · StratiFi',
  description: 'How StratiFi collects, uses, and protects your data.',
}

export default function PrivacyPage() {
  return (
    <main style={PAGE}>
      <div style={SHELL}>
        <div style={BRAND}>STRATIFI</div>
        <h1 style={H1}>Privacy Policy</h1>
        <p style={META}>Effective date: April 2026</p>

        <Section title="Overview">
          StratiFi ("we", "us") provides a personal finance intelligence app. This policy explains what
          data we collect, how we use it, and your rights as a user.
        </Section>

        <Section title="Data We Collect">
          <ul style={LIST}>
            <li><strong>Account information</strong> — name, email address, and authentication credentials
              managed by <a href="https://clerk.com" style={LINK} target="_blank" rel="noreferrer">Clerk</a>.
            </li>
            <li><strong>Financial data</strong> — transaction history from linked bank accounts (via Plaid),
              uploaded CSV files, and personal financial information you provide (income, expenses, debts,
              savings). Bank credentials are never stored by StratiFi — Plaid handles authentication.
            </li>
            <li><strong>Usage data</strong> — feature interactions, page views, and in-app events used to
              improve the product. No raw financial data is included in usage events.
            </li>
            <li><strong>Billing information</strong> — subscription status and payment metadata managed by
              {' '}<a href="https://stripe.com" style={LINK} target="_blank" rel="noreferrer">Stripe</a>.
              We never store full card numbers.
            </li>
          </ul>
        </Section>

        <Section title="How We Use Your Data">
          <ul style={LIST}>
            <li>Generate personalized financial insights, recommendations, and spending summaries</li>
            <li>Power alerts for unusual transactions, low balances, and subscription activity</li>
            <li>Provide a 30-day cashflow forecast based on your historical patterns</li>
            <li>Manage your subscription and process billing through Stripe</li>
            <li>Authenticate your identity and maintain session security through Clerk</li>
            <li>Improve app reliability and feature quality through anonymized usage analytics</li>
          </ul>
          We do not sell your data to third parties. We do not use your financial data for advertising.
        </Section>

        <Section title="Third-Party Services">
          <ul style={LIST}>
            <li>
              <strong>Clerk</strong> — handles authentication, user identity, and session management.
              {' '}<a href="https://clerk.com/privacy" style={LINK} target="_blank" rel="noreferrer">Clerk Privacy Policy →</a>
            </li>
            <li>
              <strong>Plaid</strong> — provides secure read-only access to your bank account data.
              {' '}<a href="https://plaid.com/legal" style={LINK} target="_blank" rel="noreferrer">Plaid Privacy Policy →</a>
            </li>
            <li>
              <strong>Stripe</strong> — processes subscription payments and manages billing.
              {' '}<a href="https://stripe.com/privacy" style={LINK} target="_blank" rel="noreferrer">Stripe Privacy Policy →</a>
            </li>
          </ul>
        </Section>

        <Section title="Data Storage">
          Your financial data and preferences are stored in a PostgreSQL database hosted on infrastructure
          we control. Data is encrypted at rest and in transit. We retain your data for as long as your
          account is active. When you delete your account, your data is removed within 30 days.
        </Section>

        <Section title="Your Rights">
          <ul style={LIST}>
            <li><strong>Access</strong> — you may request a copy of the personal data we hold about you.</li>
            <li><strong>Deletion</strong> — you may request deletion of your account and associated data.</li>
            <li><strong>Correction</strong> — you may ask us to correct inaccurate personal information.</li>
            <li><strong>Revocation</strong> — you may disconnect your bank account via Plaid at any time
              through your account settings.
            </li>
          </ul>
        </Section>

        <Section title="Contact">
          For privacy-related questions or requests, contact us at{' '}
          <a href="mailto:privacy@stratifi.app" style={LINK}>privacy@stratifi.app</a>.
        </Section>

        <div style={BACK_LINK_ROW}>
          <a href="/" style={BACK_LINK}>← Back to StratiFi</a>
          <a href="/terms" style={BACK_LINK}>Terms of Service →</a>
        </div>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={SECTION}>
      <h2 style={H2}>{title}</h2>
      <div style={BODY}>{children}</div>
    </section>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PAGE: React.CSSProperties = {
  minHeight:   '100vh',
  background:  '#f8fafc',
  padding:     '2.5rem 1.25rem 4rem',
  fontFamily:  '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  color:       '#1e3166',
}

const SHELL: React.CSSProperties = {
  maxWidth: 680,
  margin:   '0 auto',
}

const BRAND: React.CSSProperties = {
  fontSize:      '0.65rem',
  fontWeight:    800,
  letterSpacing: '0.12em',
  color:         '#2ab9b0',
  marginBottom:  '1.25rem',
}

const H1: React.CSSProperties = {
  fontSize:     '1.75rem',
  fontWeight:   800,
  color:        '#1e3166',
  margin:       '0 0 0.3rem',
  lineHeight:   1.2,
}

const META: React.CSSProperties = {
  fontSize:     '0.78rem',
  color:        '#9ca3af',
  margin:       '0 0 2rem',
}

const SECTION: React.CSSProperties = {
  marginBottom: '2rem',
}

const H2: React.CSSProperties = {
  fontSize:     '1rem',
  fontWeight:   700,
  color:        '#1e3166',
  margin:       '0 0 0.6rem',
  paddingBottom:'0.35rem',
  borderBottom: '1px solid #e2e8f0',
}

const BODY: React.CSSProperties = {
  fontSize:   '0.9rem',
  color:      '#374151',
  lineHeight: 1.7,
}

const LIST: React.CSSProperties = {
  margin:      '0 0 0.75rem',
  paddingLeft: '1.25rem',
  lineHeight:  1.75,
}

const LINK: React.CSSProperties = {
  color:          '#2ab9b0',
  textDecoration: 'underline',
}

const BACK_LINK_ROW: React.CSSProperties = {
  display:        'flex',
  justifyContent: 'space-between',
  marginTop:      '3rem',
  paddingTop:     '1.25rem',
  borderTop:      '1px solid #e2e8f0',
}

const BACK_LINK: React.CSSProperties = {
  fontSize:       '0.85rem',
  color:          '#2ab9b0',
  textDecoration: 'none',
  fontWeight:     600,
}
