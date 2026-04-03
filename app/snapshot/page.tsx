import { Suspense }      from 'react'
import SnapshotContent  from './SnapshotContent'

export const metadata = {
  title:       'Money Snapshot · StratiFi',
  description: 'A shared financial snapshot from StratiFi.',
}

export default function SnapshotPage() {
  return (
    <Suspense fallback={<SnapshotShell />}>
      <SnapshotContent />
    </Suspense>
  )
}

function SnapshotShell() {
  return (
    <div style={PAGE}>
      <div style={CARD}>
        <p style={{ color: '#8aaabb', fontSize: '0.9rem' }}>Loading snapshot…</p>
      </div>
    </div>
  )
}

const PAGE: React.CSSProperties = {
  minHeight:      '100vh',
  background:     'linear-gradient(160deg, #edfafa 0%, #f0f4ff 100%)',
  display:        'flex',
  flexDirection:  'column',
  alignItems:     'center',
  justifyContent: 'center',
  padding:        '2rem 1.5rem',
  fontFamily:     '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const CARD: React.CSSProperties = {
  background:   '#ffffff',
  borderRadius: 16,
  padding:      '2rem 1.5rem',
  maxWidth:     480,
  width:        '100%',
  boxShadow:    '0 4px 24px rgba(30,49,102,0.10)',
  border:       '1px solid #daeef2',
  textAlign:    'center',
}
