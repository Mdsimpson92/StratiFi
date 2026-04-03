'use client'

import { useSearchParams } from 'next/navigation'
import { decodeSnapshot }  from '@/lib/snapshot'
import type { SnapshotData } from '@/lib/snapshot'

export default function SnapshotContent() {
  const params  = useSearchParams()
  const encoded = params.get('s')
  const data    = encoded ? decodeSnapshot(encoded) : null

  return (
    <div style={PAGE}>
      {/* Top accent */}
      <div style={ACCENT_BAR} />

      <div style={SHELL}>
        {/* Brand */}
        <div style={BRAND_ROW}>
          <span style={BRAND_NAME}>STRATIFI</span>
          {data && <span style={BRAND_DATE}>{data.date}</span>}
        </div>

        <h1 style={TITLE}>Your Money Snapshot</h1>

        {!data ? (
          <p style={EMPTY}>
            This snapshot link is invalid or has expired.
          </p>
        ) : (
          <>
            <div style={CARDS}>
              <SnapshotCard
                label="Safe to spend"
                value={data.safe ?? '—'}
                accent="#0d7878"
                large={data.safe !== null}
                locked={data.safe === null}
              />
              <SnapshotCard
                label="Key action"
                value={data.rec ?? '—'}
                accent="#2ab9b0"
              />
              <SnapshotCard
                label="This month"
                value={data.insight ?? '—'}
                accent="#1e3166"
              />
            </div>

            <p style={GENERATED_LABEL}>
              Shared by a StratiFi user · data summarized, not raw
            </p>
          </>
        )}

        <div style={CTA_SECTION}>
          <p style={CTA_TEXT}>Get your own money snapshot</p>
          <a href="/" style={CTA_BTN}>Open StratiFi</a>
        </div>
      </div>
    </div>
  )
}

function SnapshotCard({
  label,
  value,
  accent,
  large  = false,
  locked = false,
}: {
  label:   string
  value:   string
  accent:  string
  large?:  boolean
  locked?: boolean
}) {
  return (
    <div style={{ ...CARD_BASE, borderTop: `3px solid ${accent}` }}>
      <div style={CARD_LABEL}>{label}</div>
      {locked ? (
        <div style={CARD_LOCKED}>🔒 Pro feature</div>
      ) : (
        <div style={{ ...CARD_VALUE, color: large ? accent : '#1e3166', fontSize: large ? '1.6rem' : '0.9rem' }}>
          {value}
        </div>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PAGE: React.CSSProperties = {
  minHeight:      '100vh',
  background:     'linear-gradient(160deg, #edfafa 0%, #f0f4ff 100%)',
  display:        'flex',
  flexDirection:  'column',
  alignItems:     'center',
  justifyContent: 'center',
  padding:        '2rem 1.25rem',
  fontFamily:     '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  color:          '#1e3166',
}

const ACCENT_BAR: React.CSSProperties = {
  position:  'fixed',
  top:       0, left: 0, right: 0,
  height:    4,
  background:'#2ab9b0',
}

const SHELL: React.CSSProperties = {
  maxWidth: 520,
  width:    '100%',
}

const BRAND_ROW: React.CSSProperties = {
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'space-between',
  marginBottom:   '0.5rem',
}

const BRAND_NAME: React.CSSProperties = {
  fontSize:      '0.7rem',
  fontWeight:    800,
  letterSpacing: '0.12em',
  color:         '#2ab9b0',
}

const BRAND_DATE: React.CSSProperties = {
  fontSize: '0.78rem',
  color:    '#8aaabb',
}

const TITLE: React.CSSProperties = {
  fontSize:     '1.65rem',
  fontWeight:   800,
  color:        '#1e3166',
  margin:       '0 0 1.5rem',
  lineHeight:   1.2,
}

const CARDS: React.CSSProperties = {
  display:       'flex',
  flexDirection: 'column',
  gap:           '0.75rem',
  marginBottom:  '1rem',
}

const CARD_BASE: React.CSSProperties = {
  background:   '#ffffff',
  borderRadius: 10,
  padding:      '1rem 1.1rem',
  boxShadow:    '0 1px 4px rgba(30,49,102,0.08)',
  border:       '1px solid #daeef2',
}

const CARD_LABEL: React.CSSProperties = {
  fontSize:      '0.65rem',
  fontWeight:    700,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color:         '#8aaabb',
  marginBottom:  '0.4rem',
}

const CARD_VALUE: React.CSSProperties = {
  fontWeight:  700,
  lineHeight:  1.45,
}

const CARD_LOCKED: React.CSSProperties = {
  fontSize:   '0.85rem',
  color:      '#9ca3af',
  fontWeight: 500,
}

const GENERATED_LABEL: React.CSSProperties = {
  fontSize:  '0.72rem',
  color:     '#8aaabb',
  textAlign: 'center',
  margin:    '0.25rem 0 1.5rem',
}

const CTA_SECTION: React.CSSProperties = {
  background:   '#ffffff',
  borderRadius: 12,
  padding:      '1.25rem',
  textAlign:    'center',
  border:       '1px solid #daeef2',
  boxShadow:    '0 1px 4px rgba(30,49,102,0.06)',
}

const CTA_TEXT: React.CSSProperties = {
  margin:     '0 0 0.75rem',
  fontSize:   '0.85rem',
  color:      '#5b7a99',
  fontWeight: 500,
}

const CTA_BTN: React.CSSProperties = {
  display:        'inline-block',
  background:     'linear-gradient(135deg, #2ab9b0, #1e3166)',
  color:          '#ffffff',
  borderRadius:   8,
  padding:        '0.65rem 1.5rem',
  fontSize:       '0.88rem',
  fontWeight:     700,
  textDecoration: 'none',
  letterSpacing:  '0.01em',
}

const EMPTY: React.CSSProperties = {
  color:        '#8aaabb',
  fontSize:     '0.9rem',
  textAlign:    'center',
  padding:      '2rem 0',
  marginBottom: '1rem',
}
