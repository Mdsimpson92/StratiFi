import { auth }        from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { runAnalysis, type FinancialSnapshot } from '@/agents/orchestrator/stratifi-orchestrator'
import { isDemoUser }  from '@/lib/demo'
import { getCashflow }            from '@/lib/db/cashflow'
import { getSubscriptions }       from '@/lib/db/subscriptions'
import { getRecommendations }     from '@/lib/db/recommendations'
import { getAlerts }              from '@/lib/db/alerts'
import { getSpendingSummary }     from '@/lib/db/insights'
import { queryOne }               from '@/lib/db/client'
import {
  getDemoCashflow, getDemoSubscriptions, getDemoRecommendations,
  getDemoAlerts, getDemoSpendingSummary, getDemoScore, getDemoAllocation,
} from '@/lib/demo'

// Demo AI analysis — pre-computed to avoid API calls for demo users
const DEMO_ANALYSIS = {
  situation: {
    summary: 'You have a net worth of $100,000 with strong emergency fund coverage at 7.8 months of expenses. Your monthly cash flow is positive at $1,000, but your retirement savings are slightly behind the target for your age. Overall, you are in a good financial position with room to optimize.',
    score_explanation: 'Your score of 68 is pulled up by your emergency fund (fully funded at $35,000) and low debt ratio (5.5% DTI). It is held back by a tight cash flow margin — only 13% of your income is free after expenses and debt payments.',
    key_metrics: [
      { label: 'Net Worth', value: '$100,000', explanation: 'Total assets minus debt. This puts you ahead of the median for your age group.' },
      { label: 'Monthly Free Cash', value: '$1,000', explanation: 'What is left after all expenses and debt payments. Target is 20%+ of income.' },
      { label: 'Subscription Load', value: '$225/mo', explanation: 'You spend $2,700/year on recurring subscriptions. One may be inactive.' },
    ],
  },
  problems: [
    { type: 'subscription_waste', title: 'Adobe CC may be unused', detail: 'No charge detected in 52 days. At $54.99/month, this costs $660/year if unused.', monthly_impact: 55, severity: 'medium' },
    { type: 'category_imbalance', title: 'Dining spending above average', detail: 'You spent $210 on restaurants this month — 42% above your 3-month average of $148.', monthly_impact: 62, severity: 'medium' },
    { type: 'cash_drag', title: 'Retirement savings behind target', detail: 'At age 30 with $75,000 saved, you are $10,000 short of the 1x salary benchmark of $85,000.', monthly_impact: null, severity: 'low' },
  ],
  actions: [
    { priority: 1, verb: 'Cancel', instruction: 'Cancel Adobe CC subscription at adobe.com/account. This saves $54.99/month ($660/year) with no impact on your finances.', expected_savings: 55, expected_score_impact: null, timeframe: 'This week' },
    { priority: 2, verb: 'Reduce', instruction: 'Reduce dining out to $150/month by cooking 3 more dinners per week at home. This frees $60/month ($720/year).', expected_savings: 60, expected_score_impact: '+2 to +3 points', timeframe: 'Starting this week' },
    { priority: 3, verb: 'Increase', instruction: 'Increase 401(k) contribution by $200/month to close the $10,000 retirement gap within 4 years.', expected_savings: null, expected_score_impact: '+5 to +8 points', timeframe: 'By end of month' },
  ],
  disclaimer: 'For informational purposes only. Not financial, tax, or legal advice.',
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Demo users get pre-computed analysis (no API cost)
    if (await isDemoUser(userId)) {
      return NextResponse.json({ analysis: DEMO_ANALYSIS })
    }

    // Gather real financial data in parallel
    const [cashflow, subs, recs, alerts, spending] = await Promise.all([
      getCashflow(userId),
      getSubscriptions(userId),
      getRecommendations(userId),
      getAlerts(userId).catch(() => []),
      getSpendingSummary(userId),
    ])

    // Get score and allocation from DB
    const scoreRow = await queryOne<{ overall_score: number; emergency_fund_score: number; debt_ratio_score: number; savings_rate_score: number }>(
      'SELECT overall_score, emergency_fund_score, debt_ratio_score, savings_rate_score FROM foundation_scores WHERE user_id = $1 ORDER BY calculated_at DESC LIMIT 1',
      [userId]
    )

    const profileRow = await queryOne<{ annual_income: number; monthly_expenses: number; total_debt: number; liquid_savings: number; retirement_savings: number }>(
      'SELECT annual_income, monthly_expenses, total_debt, liquid_savings, retirement_savings FROM profiles WHERE id = $1',
      [userId]
    )

    const snapshot: FinancialSnapshot = {
      score: scoreRow ? {
        overall: Number(scoreRow.overall_score),
        label: Number(scoreRow.overall_score) >= 80 ? 'Strong' : Number(scoreRow.overall_score) >= 65 ? 'Good' : Number(scoreRow.overall_score) >= 50 ? 'Fair' : 'Weak',
        emergency_fund_score: Number(scoreRow.emergency_fund_score),
        debt_ratio_score: Number(scoreRow.debt_ratio_score),
        savings_rate_score: Number(scoreRow.savings_rate_score),
      } : null,
      cashflow,
      subscriptions: subs,
      recommendations: recs,
      alerts,
      categories: spending.by_category,
      allocation: profileRow ? {
        net_worth: Number(profileRow.liquid_savings) + Number(profileRow.retirement_savings) - Number(profileRow.total_debt),
        liquid_savings: Number(profileRow.liquid_savings),
        retirement_savings: Number(profileRow.retirement_savings),
        total_debt: Number(profileRow.total_debt),
        monthly_income: Number(profileRow.annual_income) / 12,
        monthly_expenses: Number(profileRow.monthly_expenses),
      } : null,
    }

    const analysis = await runAnalysis(snapshot)
    return NextResponse.json({ analysis })
  } catch (err) {
    console.error('[/api/ai/stratifi]', err)
    return NextResponse.json({ error: 'AI analysis failed.' }, { status: 500 })
  }
}
