import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About — StratiFi',
  description: 'What StratiFi is, how it works, and where it\'s going.',
}

export default function AboutPage() {
  return (
    <div style={PAGE}>
      <a href="/" style={BACK}>← Back to dashboard</a>

      <h1 style={TITLE}>What is StratiFi?</h1>

      <Section>
        <p style={LEAD}>
          StratiFi is a financial decision engine — not another budgeting app.
        </p>
        <p style={BODY}>
          Most finance tools show you what already happened. StratiFi shows you what you can do next.
          It calculates a daily safe-to-spend number, surfaces upcoming obligations, and ranks your
          highest-impact financial moves — so every spending decision is informed, not guessed.
        </p>
      </Section>

      <Section title="The Problem">
        <p style={BODY}>
          People don't lack financial data. They lack decision clarity. You can see every transaction
          in your bank app, but none of them answer the question that actually matters:
        </p>
        <p style={PULL}>"What can I spend right now without creating a problem later?"</p>
        <p style={BODY}>
          That question requires combining income timing, bill schedules, savings goals, and spending
          patterns into a single forward-looking number. No bank app does that. StratiFi does.
        </p>
      </Section>

      <Section title="How It Works">
        <p style={BODY}>
          Connect a bank account, upload a CSV, or enter your financial profile. StratiFi analyzes
          your income, recurring bills, and spending history to build a forward model of your cash flow.
        </p>
        <p style={BODY}>From that model, it calculates:</p>
        <ul style={LIST}>
          <li><strong>Safe-to-spend</strong> — your daily discretionary budget after all obligations</li>
          <li><strong>30-day forecast</strong> — projected income, expenses, and net position</li>
          <li><strong>Ranked recommendations</strong> — the highest-leverage actions for your situation</li>
          <li><strong>Anomaly detection</strong> — charges that don't match your patterns</li>
          <li><strong>Subscription tracking</strong> — recurring charges and potential waste</li>
        </ul>
        <p style={BODY}>
          Everything updates automatically as new data comes in. No manual logging. No spreadsheets.
        </p>
      </Section>

      <Section title="What Makes It Different">
        <p style={BODY}>
          Budgeting apps ask you to categorize every latte. StratiFi doesn't care about lattes.
          It cares about whether you can afford the latte without missing rent. That's a fundamentally
          different question — and it requires a fundamentally different engine.
        </p>
        <p style={BODY}>
          StratiFi is forward-looking by default. It doesn't score your past. It plans your future.
        </p>
      </Section>

      <Section title="Where It's Going">
        <p style={BODY}>
          The safe-to-spend number is the foundation. On top of it, StratiFi is becoming a personal
          financial operating system: automated bill negotiation, smart savings rules, investment
          allocation, and AI-powered scenario planning ("What if I take this job?" / "What if I
          buy this car?").
        </p>
        <p style={BODY}>
          The goal is simple: make every financial decision as clear as checking the weather.
        </p>
      </Section>

      <div style={FOOTER}>
        <a href="/privacy" style={FOOTER_LINK}>Privacy Policy</a>
        <span style={FOOTER_SEP}>·</span>
        <a href="/terms" style={FOOTER_LINK}>Terms of Service</a>
      </div>
    </div>
  )
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section style={SECTION}>
      {title && <h2 style={H2}>{title}</h2>}
      {children}
    </section>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const C = '#1e3166'

const PAGE: React.CSSProperties = {
  maxWidth: 640, margin: '0 auto', padding: '2rem 1.25rem 3rem',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  color: C, background: '#f0f9fb', minHeight: '100vh',
}

const BACK: React.CSSProperties = {
  fontSize: '0.82rem', color: '#5b7a99', textDecoration: 'none',
  display: 'inline-block', marginBottom: '1.5rem',
}

const TITLE: React.CSSProperties = {
  fontSize: 'clamp(1.4rem, 5vw, 1.8rem)', fontWeight: 800, margin: '0 0 1.5rem',
  lineHeight: 1.2, color: C,
}

const SECTION: React.CSSProperties = { marginBottom: '2rem' }

const H2: React.CSSProperties = {
  fontSize: 'clamp(1rem, 4vw, 1.2rem)', fontWeight: 700, margin: '0 0 0.75rem',
  color: '#2ab9b0',
}

const LEAD: React.CSSProperties = {
  fontSize: 'clamp(1rem, 3.5vw, 1.1rem)', fontWeight: 600, lineHeight: 1.5,
  margin: '0 0 0.75rem', color: C,
}

const BODY: React.CSSProperties = {
  fontSize: '0.92rem', lineHeight: 1.65, margin: '0 0 0.75rem', color: '#374151',
}

const PULL: React.CSSProperties = {
  fontSize: '1.05rem', fontWeight: 700, fontStyle: 'italic', color: C,
  margin: '1rem 0', padding: '0.75rem 1rem',
  borderLeft: '3px solid #2ab9b0', background: '#f0fdfc', borderRadius: 4,
}

const LIST: React.CSSProperties = {
  margin: '0.5rem 0 1rem 1.25rem', fontSize: '0.92rem', lineHeight: 1.65,
  color: '#374151',
}

const FOOTER: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0.4rem',
  paddingTop: '1.5rem', borderTop: '1px solid #daeef2',
}
const FOOTER_LINK: React.CSSProperties = { fontSize: '0.75rem', color: '#6b7280', textDecoration: 'underline' }
const FOOTER_SEP: React.CSSProperties = { fontSize: '0.7rem', color: '#d1d5db' }
