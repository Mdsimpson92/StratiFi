export const metadata = {
  title:       'Terms of Service · StratiFi',
  description: 'Terms governing use of the StratiFi app.',
}

export default function TermsPage() {
  return (
    <main style={PAGE}>
      <div style={SHELL}>
        <div style={BRAND}>STRATIFI</div>
        <h1 style={H1}>Terms of Service</h1>
        <p style={META}>Effective date: April 2026</p>

        <Section title="Service Description">
          StratiFi is a personal finance intelligence app that analyzes your financial data to provide
          spending insights, cashflow analysis, budget recommendations, and financial alerts. You can connect
          bank accounts via Plaid, upload CSV transaction files, or enter your financial profile manually.
          The app is intended for personal, non-commercial use.
        </Section>

        <Section title="Financial Disclaimer">
          <strong>
            StratiFi provides financial insights for informational purposes only and does not constitute
            financial, investment, or legal advice.
          </strong>
          {' '}All outputs — including safe-to-spend figures, recommendations, forecasts, and alerts — are
          algorithmic estimates based on your transaction history. They do not account for your complete
          financial picture, tax situation, or personal circumstances. Always consult a qualified financial
          professional before making significant financial decisions. StratiFi makes no guarantees
          regarding the accuracy, completeness, or fitness of any information provided.
        </Section>

        <Section title="User Responsibilities">
          <ul style={LIST}>
            <li>You must be at least 18 years old to use StratiFi.</li>
            <li>You are responsible for maintaining the security of your account credentials.</li>
            <li>You may only connect bank accounts that you own or are legally authorized to access.</li>
            <li>You agree not to use the service for any unlawful purpose or in violation of these terms.</li>
            <li>You agree not to attempt to reverse-engineer, scrape, or otherwise extract data from
              the service beyond normal use.
            </li>
          </ul>
        </Section>

        <Section title="Subscription Terms">
          StratiFi Pro is a paid subscription billed through{' '}
          <a href="https://stripe.com" style={LINK} target="_blank" rel="noreferrer">Stripe</a>.
          <ul style={LIST}>
            <li><strong>Monthly plan</strong> — $9.00 USD billed each month.</li>
            <li><strong>Annual plan</strong> — $79.00 USD billed once per year ($6.58/month equivalent).</li>
            <li>You may cancel your subscription at any time through your account settings. Cancellation
              takes effect at the end of the current billing period. No partial refunds are issued.
            </li>
            <li>We reserve the right to change pricing with 30 days' notice to active subscribers.</li>
          </ul>
        </Section>

        <Section title="Limitation of Liability">
          To the fullest extent permitted by law, StratiFi and its operators shall not be liable for any
          indirect, incidental, special, consequential, or punitive damages arising from your use of the
          service, including but not limited to financial losses, data loss, or decisions made based on
          app outputs. Our total liability for any claim shall not exceed the amount you paid to us in the
          12 months preceding the claim.
        </Section>

        <Section title="No Guarantee of Financial Outcomes">
          StratiFi does not guarantee any financial outcome, return, savings, or result from using the
          service. Projections, forecasts, and recommendations are estimates only. Past patterns in your
          transaction history are not a reliable indicator of future financial performance.
        </Section>

        <Section title="Termination">
          We may suspend or terminate your account if you violate these terms, engage in fraudulent
          activity, or if we discontinue the service. You may delete your account at any time through
          Settings. Upon termination, your data will be deleted in accordance with our{' '}
          <a href="/privacy" style={LINK}>Privacy Policy</a>.
        </Section>

        <Section title="Changes to These Terms">
          We may update these terms from time to time. Continued use of the app after changes are posted
          constitutes acceptance of the updated terms. We will notify active users of material changes
          via email or in-app notice.
        </Section>

        <Section title="Contact">
          For questions about these terms, contact us at{' '}
          <a href="mailto:legal@stratifi.app" style={LINK}>legal@stratifi.app</a>.
        </Section>

        <div style={BACK_LINK_ROW}>
          <a href="/" style={BACK_LINK}>← Back to StratiFi</a>
          <a href="/privacy" style={BACK_LINK}>Privacy Policy →</a>
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
  fontSize:   '1.75rem',
  fontWeight: 800,
  color:      '#1e3166',
  margin:     '0 0 0.3rem',
  lineHeight: 1.2,
}

const META: React.CSSProperties = {
  fontSize: '0.78rem',
  color:    '#9ca3af',
  margin:   '0 0 2rem',
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
  margin:      '0.5rem 0 0',
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
