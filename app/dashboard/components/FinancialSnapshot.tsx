/** Grid of key financial figures from the user's profile. */
export default function FinancialSnapshot({
  annual_income,
  monthly_expenses,
  liquid_savings,
  total_debt,
}: {
  annual_income:    number
  monthly_expenses: number
  liquid_savings:   number
  total_debt:       number
}) {
  const fmt = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

  const items = [
    { label: 'Annual Income',    value: fmt(annual_income) },
    { label: 'Monthly Expenses', value: fmt(monthly_expenses) },
    { label: 'Liquid Savings',   value: fmt(liquid_savings) },
    { label: 'Total Debt',       value: fmt(total_debt) },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
      {items.map(i => (
        <div key={i.label} style={{ padding: '0.75rem', background: '#f9fafb', borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{i.label}</p>
          <p style={{ margin: '0.25rem 0 0', fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>{i.value}</p>
        </div>
      ))}
    </div>
  )
}
