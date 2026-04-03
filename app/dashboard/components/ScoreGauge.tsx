/** Radial gauge displaying the Foundation Score (0–100). */
export default function ScoreGauge({ score }: { score: number }) {
  const rounded = Math.round(score)
  const pct     = Math.min(100, Math.max(0, rounded))
  const radius  = 54
  const circ    = 2 * Math.PI * radius
  const offset  = circ * (1 - pct / 100)

  return (
    <div style={{ position: 'relative', width: 130, height: 130, flexShrink: 0 }}>
      <svg viewBox="0 0 120 120" width={130} height={130}>
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={radius}
          fill="none" stroke="#2ab9b0" strokeWidth="10"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1f2937' }}>{rounded}</span>
      </div>
    </div>
  )
}
