/**
 * Capital Priority Engine
 *
 * Ranks the user's next best money moves based on their Foundation Score
 * factors and profile data. Each action is assigned an urgency score
 * (higher = more pressing), then the top results are returned ranked.
 *
 * Possible actions:
 *   1. Build emergency fund
 *   2. Accelerate debt payoff
 *   3. Increase cash flow margin
 *   4. Start investing
 *   5. Boost retirement contributions
 */

import type { ProfileData } from '@/lib/schemas/profile'
import type { FoundationScoreResult } from './foundation-score'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecommendationResult {
  priority_rank: number
  category: 'emergency_fund' | 'debt' | 'savings' | 'investment'
  title: string
  description: string
  action: string
}

interface ScoredAction {
  urgency: number
  rec: Omit<RecommendationResult, 'priority_rank'>
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export function computeCapitalPriorities(
  profile: ProfileData,
  scores: FoundationScoreResult
): RecommendationResult[] {
  const monthlyIncome = profile.annual_income / 12
  const freeCashFlow =
    monthlyIncome - profile.monthly_expenses - profile.monthly_debt_payment
  const monthsCovered =
    profile.monthly_expenses > 0
      ? profile.liquid_savings / profile.monthly_expenses
      : 0
  const dti =
    monthlyIncome > 0 ? profile.monthly_debt_payment / monthlyIncome : 0

  const actions: ScoredAction[] = []

  // ── 1. Build emergency fund ────────────────────────────────────────────────
  // Always evaluated. Urgency scales with how far below 3 months the user is.
  if (monthsCovered < 6) {
    const targetSavings = profile.monthly_expenses * 3
    const shortfall = Math.max(0, targetSavings - profile.liquid_savings)
    const suggestedMonthly = Math.max(
      50,
      Math.round(Math.min(freeCashFlow > 0 ? freeCashFlow * 0.5 : 200, shortfall))
    )
    // Boost urgency if this matches the user's primary goal
    const goalBoost = profile.primary_goal === 'emergency_fund' ? 20 : 0
    actions.push({
      urgency: (100 - scores.emergency_fund_score) + goalBoost,
      rec: {
        category: 'emergency_fund',
        title: 'Build your emergency fund',
        description:
          `You have ${monthsCovered.toFixed(1)} months of expenses covered. ` +
          `A 3-month fund ($${targetSavings.toLocaleString()}) protects against job loss or surprise bills.`,
        action:
          `Direct $${suggestedMonthly.toLocaleString()}/month to a high-yield savings account ` +
          `until you reach $${targetSavings.toLocaleString()}.`,
      },
    })
  }

  // ── 2. Accelerate debt payoff ──────────────────────────────────────────────
  // Evaluated when there is outstanding debt.
  if (profile.total_debt > 0) {
    // High-DTI debt is more urgent than low-DTI debt
    const dtiPenalty = dti > 0.15 ? 1.25 : 0.70
    const goalBoost = profile.primary_goal === 'debt_payoff' ? 20 : 0
    const extraPayment = Math.max(50, Math.round(freeCashFlow * 0.2))
    actions.push({
      urgency: (100 - scores.debt_ratio_score) * dtiPenalty + goalBoost,
      rec: {
        category: 'debt',
        title: 'Accelerate debt payoff',
        description:
          `Your debt payments are ${(dti * 100).toFixed(0)}% of monthly income ` +
          `($${profile.total_debt.toLocaleString()} total). ` +
          `Reducing this frees cash flow for everything else.`,
        action:
          `Add $${extraPayment.toLocaleString()}/month to your highest-interest debt. ` +
          `Use the avalanche method (highest rate first) to minimize total interest paid.`,
      },
    })
  }

  // ── 3. Improve cash flow margin ────────────────────────────────────────────
  // Evaluated when free cash flow is less than 20% of income.
  if (freeCashFlow < monthlyIncome * 0.2) {
    const deficitUrgency = freeCashFlow < 0 ? 85 : clamp(60 - (freeCashFlow / monthlyIncome) * 100)
    actions.push({
      urgency: deficitUrgency,
      rec: {
        category: 'savings',
        title: 'Increase your monthly cash flow',
        description:
          freeCashFlow >= 0
            ? `Only ${((freeCashFlow / monthlyIncome) * 100).toFixed(0)}% of your income is free each month. ` +
              `Target 20%+ to fund goals and build resilience.`
            : `You are spending $${Math.abs(freeCashFlow).toLocaleString()} more per month than you earn. ` +
              `This must be addressed before other goals.`,
        action:
          'Audit your monthly subscriptions, dining, and discretionary spending. ' +
          'Each $100/month freed is worth $36,000+ over 30 years invested at 7%.',
      },
    })
  }

  // ── 4. Start investing ─────────────────────────────────────────────────────
  // Evaluated when emergency fund is at least half-funded and cash flow is positive.
  if (scores.emergency_fund_score >= 40 && freeCashFlow > 100) {
    const goalBoost =
      profile.primary_goal === 'wealth_building' || profile.primary_goal === 'home_purchase'
        ? 20
        : 0
    const investAmount = Math.max(50, Math.round(freeCashFlow * 0.3))
    actions.push({
      urgency: 40 + goalBoost,
      rec: {
        category: 'investment',
        title: 'Start investing for long-term growth',
        description:
          `Your foundation is stable enough to begin building wealth. ` +
          `Time in the market is your most valuable asset — starting now matters more than the amount.`,
        action:
          `Open a brokerage account and invest $${investAmount.toLocaleString()}/month in ` +
          `a low-cost total market index fund (e.g. VTSAX or VTI).`,
      },
    })
  }

  // ── 5. Boost retirement contributions ─────────────────────────────────────
  // Evaluated when retirement score has room to improve and cash flow allows it.
  const retirementFactor = scores.factors.find(f => f.key === 'retirement')
  if (retirementFactor && retirementFactor.score < 80 && freeCashFlow > 0) {
    const goalBoost = profile.primary_goal === 'retirement' ? 25 : 0
    const retirementBump = freeCashFlow > 500 ? '$200' : '$50'
    actions.push({
      urgency: 45 + (80 - retirementFactor.score) * 0.4 + goalBoost,
      rec: {
        category: 'investment',
        title: 'Boost retirement contributions',
        description:
          `Your retirement savings are behind the recommended pace for age ${profile.age}. ` +
          `Compound growth is most powerful when started early.`,
        action:
          `Increase your 401(k) or IRA contributions by ${retirementBump}/month. ` +
          `Always capture any employer match first — it is an instant 50–100% return.`,
      },
    })
  }

  // ── Rank and return top 5 ──────────────────────────────────────────────────
  return actions
    .sort((a, b) => b.urgency - a.urgency)
    .slice(0, 5)
    .map((a, i) => ({ ...a.rec, priority_rank: i + 1 }))
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value))
}
