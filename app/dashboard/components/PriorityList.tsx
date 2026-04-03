/** Ranked list of financial priorities / recommendations. */
export default function PriorityList({
  recommendations,
}: {
  recommendations: { priority_rank?: number; category: string; title: string; description: string; action: string }[]
}) {
  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {recommendations.map((r, i) => (
        <li key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
          <span style={{
            width: 28, height: 28, borderRadius: '50%', background: '#f3f4f6',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.78rem', fontWeight: 700, color: '#6b7280', flexShrink: 0,
          }}>
            {r.priority_rank ?? i + 1}
          </span>
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.88rem', color: '#111827' }}>{r.title}</p>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.82rem', color: '#6b7280', lineHeight: 1.5 }}>{r.description}</p>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: '#2ab9b0', fontWeight: 500 }}>{r.action}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
