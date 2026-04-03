import { getCashflow }            from './cashflow'
import { getForecast }            from './forecast'
import { getSubscriptions }       from './subscriptions'
import { getUnusualTransactions } from './anomalies'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecommendationPriority = 'low' | 'medium' | 'high'

export type RecommendationType =
  | 'safe_to_spend_today'
  | 'reduce_spending_warning'
  | 'upcoming_cash_risk'
  | 'subscription_savings_opportunity'
  | 'unusual_activity_action'

export interface Recommendation {
  id:               string
  type:             RecommendationType
  priority:         RecommendationPriority
  title:            string
  explanation:      string
  suggested_action: string
  savings_amount?:  number
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

const LOW_BALANCE_THRESHOLD      = 500    // projected net below this → cash risk
const SUBSCRIPTION_HIGH_THRESHOLD = 200   // monthly sub cost above this → review
const SAFE_SPEND_MIN_SURPLUS      = 100   // projected net must be at least this to suggest spending
const SPENDING_SPIKE_RATIO        = 1.20  // current month spend 20%+ above last month

// ─── Engine ───────────────────────────────────────────────────────────────────

export async function getRecommendations(user_id: string): Promise<Recommendation[]> {
  const [cashflow, forecast, subData, anomalies] = await Promise.all([
    getCashflow(user_id),
    getForecast(user_id),
    getSubscriptions(user_id),
    getUnusualTransactions(user_id),
  ])

  const recommendations: Recommendation[] = []

  // ── 1. Upcoming cash risk ─────────────────────────────────────────────────
  // Triggered when projected 30-day net is below threshold
  if (forecast.projected_net_30d < LOW_BALANCE_THRESHOLD) {
    const isNegative = forecast.projected_net_30d < 0
    recommendations.push({
      id:               'upcoming_cash_risk',
      type:             'upcoming_cash_risk',
      priority:         isNegative ? 'high' : 'medium',
      title:            isNegative
                          ? 'Your balance may go negative'
                          : 'Cash is running tight this month',
      explanation:      isNegative
                          ? `Based on your spending patterns, you're on track to spend more than you earn by $${Math.abs(forecast.projected_net_30d).toFixed(0)} this month.`
                          : `You're projected to have only $${forecast.projected_net_30d.toFixed(0)} left after this month's bills.`,
      suggested_action: 'Cut discretionary spending this week and avoid large purchases.',
    })
  }

  // ── 2. Spending spike warning ─────────────────────────────────────────────
  // Triggered when current month outflow is significantly above last month
  const months = cashflow.by_month
  if (months.length >= 2) {
    const current  = months[months.length - 1]
    const previous = months[months.length - 2]
    if (previous.outflow > 0 && current.outflow > previous.outflow * SPENDING_SPIKE_RATIO) {
      const diff = current.outflow - previous.outflow
      recommendations.push({
        id:               'reduce_spending_warning',
        type:             'reduce_spending_warning',
        priority:         diff > 500 ? 'high' : 'medium',
        title:            'You\'re spending more than usual',
        explanation:      `Your spending this month is $${diff.toFixed(0)} higher than last month — a ${Math.round((current.outflow / previous.outflow - 1) * 100)}% increase.`,
        suggested_action: 'Review your recent transactions and pause non-essential purchases.',
        savings_amount:   diff,
      })
    }
  }

  // ── 3. Subscription savings opportunity ──────────────────────────────────
  // Triggered when monthly subscription cost is high or waste flags exist
  if (subData.total_monthly_cost > SUBSCRIPTION_HIGH_THRESHOLD || subData.waste_flags.length > 0) {
    const hasWaste = subData.waste_flags.length > 0
    const wasteList = subData.waste_flags.map(f => f.merchant).slice(0, 3).join(', ')
    recommendations.push({
      id:               'subscription_savings_opportunity',
      type:             'subscription_savings_opportunity',
      priority:         hasWaste ? 'high' : 'medium',
      title:            hasWaste
                          ? 'You may be paying for subscriptions you don\'t use'
                          : 'Your subscriptions add up to a lot',
      explanation:      hasWaste
                          ? `${wasteList} ${subData.waste_flags.length === 1 ? 'hasn\'t' : 'haven\'t'} had recent activity. You're spending $${subData.total_monthly_cost.toFixed(0)}/month on subscriptions total.`
                          : `You're spending $${subData.total_monthly_cost.toFixed(0)}/month on subscriptions. That's $${(subData.total_monthly_cost * 12).toFixed(0)}/year.`,
      suggested_action: hasWaste
                          ? `Consider cancelling ${wasteList}.`
                          : 'Review your subscriptions and cancel any you rarely use.',
      savings_amount:   subData.waste_flags.length > 0
                          ? subData.waste_flags.reduce((sum, f) => {
                              const match = subData.subscriptions.find(s => s.normalized_merchant === f.merchant)
                              return sum + (match?.estimated_monthly_cost ?? 0)
                            }, 0)
                          : undefined,
    })
  }

  // ── 4. Unusual activity action ────────────────────────────────────────────
  // Triggered when high-ratio anomalies exist in recent transactions
  const recentAnomalies = anomalies.filter(a => a.anomaly_ratio >= 3)
  if (recentAnomalies.length > 0) {
    const top = recentAnomalies[0]
    recommendations.push({
      id:               'unusual_activity_action',
      type:             'unusual_activity_action',
      priority:         top.anomaly_ratio >= 5 ? 'high' : 'medium',
      title:            'Unusual charge detected',
      explanation:      `A charge of $${top.amount.toFixed(2)} at ${top.normalized_merchant} is ${top.anomaly_ratio.toFixed(1)}× your usual amount there.`,
      suggested_action: 'Check this charge is legitimate. If not, dispute it with your bank.',
    })
  }

  // ── 5. Safe to spend today ────────────────────────────────────────────────
  // Only shown if no high-priority issues, and there's a meaningful surplus
  const hasHighPriority = recommendations.some(r => r.priority === 'high')
  if (!hasHighPriority && forecast.projected_net_30d >= SAFE_SPEND_MIN_SURPLUS) {
    // Conservative: suggest 10% of projected surplus as safe daily spend
    const safeDaily = Math.floor((forecast.projected_net_30d * 0.10) / 7)
    if (safeDaily >= 10) {
      recommendations.push({
        id:               'safe_to_spend_today',
        type:             'safe_to_spend_today',
        priority:         'low',
        title:            `You can safely spend $${safeDaily} today`,
        explanation:      `Your projected surplus this month is $${forecast.projected_net_30d.toFixed(0)} after upcoming bills. You\'re in a good position.`,
        suggested_action: 'Stay on track and keep your spending below this daily budget.',
        savings_amount:   forecast.projected_net_30d,
      })
    }
  }

  // Sort: high → medium → low
  const PRIORITY_ORDER: Record<RecommendationPriority, number> = { high: 0, medium: 1, low: 2 }
  return recommendations.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
}
