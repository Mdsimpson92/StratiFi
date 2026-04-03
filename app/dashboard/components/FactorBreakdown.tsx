import type { FactorScore } from '@/lib/engines/foundation-score'

/** Horizontal bar breakdown of each Foundation Score factor. */
export default function FactorBreakdown({ factors }: { factors: FactorScore[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {factors.map(f => (
        <div key={f.key}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>{f.label}</span>
            <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>{Math.round(f.score)}</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: '#e5e7eb', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, f.score)}%`, borderRadius: 4, background: '#2ab9b0' }} />
          </div>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>{f.detail}</p>
        </div>
      ))}
    </div>
  )
}
