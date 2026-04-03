import { auth, currentUser }       from '@clerk/nextjs/server'
import { redirect, notFound }      from 'next/navigation'
import { queryOne }                 from '@/lib/db/client'
import Navbar                       from '@/app/components/Navbar'
import TransactionTable             from './components/TransactionTable'
import { getTransactionsForFile }   from '@/lib/actions/transactions'
import Link                         from 'next/link'

// ─── Summary stats ────────────────────────────────────────────────────────────

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function computeSummary(rows: Awaited<ReturnType<typeof getTransactionsForFile>>) {
  const debits  = rows.filter(r => r.direction === 'debit'  && !r.is_transfer && !r.is_ignored)
  const credits = rows.filter(r => r.direction === 'credit' && !r.is_transfer && !r.is_ignored)

  const totalSpend  = debits.reduce((s, r) => s + r.amount, 0)
  const totalIncome = credits.reduce((s, r) => s + r.amount, 0)

  // Spend by category
  const byCategory: Record<string, number> = {}
  for (const r of debits) {
    byCategory[r.category] = (byCategory[r.category] ?? 0) + r.amount
  }
  const topCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  const recurringCount = rows.filter(r => r.is_recurring && !r.is_ignored).length

  return { totalSpend, totalIncome, topCategories, recurringCount }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function FileDetailPage({
  params,
}: {
  params: Promise<{ fileId: string }>
}) {
  const { fileId } = await params
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user  = await currentUser()
  const email = user?.emailAddresses?.[0]?.emailAddress ?? ''

  // Fetch file metadata via pg
  const fileRecord = await queryOne<{
    filename:         string
    row_count:        number
    date_range_start: string | null
    date_range_end:   string | null
    status:           string
  }>(
    `SELECT filename, row_count, date_range_start::text, date_range_end::text, status
     FROM uploaded_files
     WHERE id = $1 AND user_id = $2`,
    [fileId, userId]
  )

  if (!fileRecord) notFound()

  const rows = await getTransactionsForFile(fileId)
  const { totalSpend, totalIncome, topCategories, recurringCount } = computeSummary(rows)

  function fmtDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar email={email} />

      <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/transactions" className="text-sm text-gray-400 hover:text-gray-600">
            ← All files
          </Link>
        </div>

        <div>
          <h1 className="text-lg font-semibold text-gray-900">{fileRecord.filename}</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {fileRecord.row_count} transactions · {fmtDate(fileRecord.date_range_start)} – {fmtDate(fileRecord.date_range_end)}
          </p>
        </div>

        {/* Summary stats */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Summary</h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <StatCard label="Total Spend"   value={formatCurrency(totalSpend)}  />
            <StatCard label="Total Income"  value={formatCurrency(totalIncome)} />
            <StatCard label="Net"           value={formatCurrency(totalIncome - totalSpend)}
              valueClass={totalIncome - totalSpend >= 0 ? 'text-green-600' : 'text-red-600'} />
            <StatCard label="Recurring"     value={`${recurringCount} charges`} />
          </div>

          {topCategories.length > 0 && (
            <>
              <h3 className="text-xs font-medium text-gray-500 mb-3">Top Spending Categories</h3>
              <ul className="space-y-2">
                {topCategories.map(([cat, amt]) => (
                  <li key={cat} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 capitalize">{cat}</span>
                    <span className="text-gray-900 font-medium">{formatCurrency(amt)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* Transaction list */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-5">Transactions</h2>
          <TransactionTable initialRows={rows} />
        </section>

      </main>
    </div>
  )
}

function StatCard({
  label,
  value,
  valueClass = 'text-gray-900',
}: {
  label:       string
  value:       string
  valueClass?: string
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-base font-semibold ${valueClass}`}>{value}</p>
    </div>
  )
}
