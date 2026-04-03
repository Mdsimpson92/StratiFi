import { notFound }                  from 'next/navigation'
import { query, queryOne }           from '@/lib/db/client'
import { computeFoundationScore }    from '@/lib/engines/foundation-score'
import { computeCapitalPriorities }  from '@/lib/engines/capital-priority'
import type { ProfileData }          from '@/lib/schemas/profile'
import ScoreGauge                    from '@/app/dashboard/components/ScoreGauge'
import FactorBreakdown               from '@/app/dashboard/components/FactorBreakdown'
import PriorityList                  from '@/app/dashboard/components/PriorityList'
import FinancialSnapshot             from '@/app/dashboard/components/FinancialSnapshot'
import PrintButton                   from './components/PrintButton'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toProfileData(row: Record<string, unknown>): ProfileData {
  return {
    age:                  Number(row.age)                  || 25,
    household_size:       Number(row.household_size)       || 1,
    annual_income:        Number(row.annual_income)        || 0,
    monthly_expenses:     Number(row.monthly_expenses)     || 0,
    total_debt:           Number(row.total_debt)           || 0,
    monthly_debt_payment: Number(row.monthly_debt_payment) || 0,
    liquid_savings:       Number(row.liquid_savings)       || 0,
    retirement_savings:   Number(row.retirement_savings)   || 0,
    primary_goal:   (row.primary_goal   as ProfileData['primary_goal'])   || 'wealth_building',
    time_horizon:   (row.time_horizon   as ProfileData['time_horizon'])   || 'medium',
    risk_tolerance: (row.risk_tolerance as ProfileData['risk_tolerance']) || 'moderate',
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ReportPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params

  // Fetch profile — only show if share_enabled is true (app-layer authorization)
  const profileRow = await queryOne<Record<string, unknown>>(
    `SELECT * FROM profiles WHERE id = $1 AND share_enabled = true`,
    [userId]
  )

  if (!profileRow) notFound()

  const profile = toProfileData(profileRow)
  const scores  = computeFoundationScore(profile)

  // Fetch stored data (falls back to live computation)
  const savedScore = await queryOne<{ overall_score: number; calculated_at: string }>(
    `SELECT overall_score, calculated_at::text
     FROM foundation_scores
     WHERE user_id = $1
     ORDER BY calculated_at DESC
     LIMIT 1`,
    [userId]
  )

  const savedRecs = await query<{
    priority_rank: number
    category:      string
    title:         string
    description:   string
    action:        string
  }>(
    `SELECT priority_rank, category, title, description, action
     FROM recommendations
     WHERE user_id = $1
     ORDER BY priority_rank ASC`,
    [userId]
  )

  const overall = savedScore?.overall_score ?? scores.overall_score

  const recommendations =
    savedRecs.length > 0
      ? savedRecs
      : computeCapitalPriorities(profile, scores)

  const generatedDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const scoreLabel =
    overall >= 80 ? 'Strong' :
    overall >= 65 ? 'Good'   :
    overall >= 50 ? 'Fair'   :
    overall >= 35 ? 'Weak'   :
    'At Risk'

  return (
    <>
      <style>{`
        @media print {
          @page { margin: 0.75in; }
          body   { background: white !important; }
          .page-section { break-inside: avoid; }
        }
      `}</style>

      <div className="min-h-screen bg-gray-50 print:bg-white">

        {/* Action bar (hidden when printing) */}
        <div className="print:hidden bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
            <span className="text-base font-semibold text-gray-900">Stratifi</span>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 hidden sm:block">Financial Plan</span>
              <PrintButton />
            </div>
          </div>
        </div>

        {/* Report body */}
        <main className="max-w-3xl mx-auto px-4 py-10 print:py-0 space-y-6 print:space-y-5">

          {/* Report header */}
          <div className="page-section pt-2 print:pt-4">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Financial Foundation Report
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Prepared by Stratifi · {generatedDate}
            </p>
            <div className="mt-3 h-px bg-gray-200" />
          </div>

          {/* Foundation Score */}
          <section className="page-section bg-white rounded-xl border border-gray-200 shadow-sm print:shadow-none p-8">
            <div className="flex flex-col sm:flex-row items-center gap-8">
              <ScoreGauge score={overall} />
              <div className="flex-1 text-center sm:text-left">
                <h2 className="text-xl font-semibold text-gray-900 mb-1">
                  Foundation Score
                </h2>
                <p className="text-sm text-gray-500 mb-3">
                  An overall measure of financial health across 6 weighted factors.
                </p>
                <div className="inline-flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1">
                  <span className="text-sm font-semibold text-gray-700">
                    {Math.round(overall)} / 100 — {scoreLabel}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Capital Priorities */}
          <section className="page-section bg-white rounded-xl border border-gray-200 shadow-sm print:shadow-none p-8">
            <div className="mb-6">
              <h2 className="text-base font-semibold text-gray-900">Top Priorities</h2>
              <p className="text-sm text-gray-400 mt-0.5">
                Ranked actions based on your financial profile.
              </p>
            </div>
            <PriorityList recommendations={recommendations.slice(0, 3)} />
          </section>

          {/* Score Breakdown */}
          <section className="page-section bg-white rounded-xl border border-gray-200 shadow-sm print:shadow-none p-8">
            <div className="mb-6">
              <h2 className="text-base font-semibold text-gray-900">Score Breakdown</h2>
              <p className="text-sm text-gray-400 mt-0.5">
                How each factor contributes to your Foundation Score.
              </p>
            </div>
            <FactorBreakdown factors={scores.factors} />
          </section>

          {/* Financial Snapshot */}
          <section className="page-section bg-white rounded-xl border border-gray-200 shadow-sm print:shadow-none p-8">
            <div className="mb-6">
              <h2 className="text-base font-semibold text-gray-900">Financial Snapshot</h2>
              <p className="text-sm text-gray-400 mt-0.5">Key numbers from your profile.</p>
            </div>
            <FinancialSnapshot
              annual_income={profile.annual_income}
              monthly_expenses={profile.monthly_expenses}
              liquid_savings={profile.liquid_savings}
              total_debt={profile.total_debt}
            />
          </section>

          {/* Report footer */}
          <div className="page-section pb-6 print:pb-8">
            <div className="h-px bg-gray-200 mb-4" />
            <p className="text-xs text-gray-400 text-center">
              Generated by Stratifi · {generatedDate} · For informational purposes only.
              This report does not constitute financial advice.
            </p>
          </div>

        </main>
      </div>
    </>
  )
}
