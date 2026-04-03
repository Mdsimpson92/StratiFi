/**
 * Foundation Score Engine
 *
 * Evaluates 6 weighted factors from the user's financial profile and
 * produces a single 0–100 Foundation Score plus a per-factor breakdown.
 *
 * Weights:
 *   Emergency Fund     25%
 *   Debt-to-Income     20%
 *   Cash Flow Margin   20%
 *   Savings Rate       15%
 *   Debt Load          10%
 *   Retirement         10%
 */

import type { ProfileData } from '@/lib/schemas/profile'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FactorScore {
  key: string
  label: string
  score: number    // 0–100
  weight: number   // decimal, e.g. 0.25
  detail: string   // human-readable explanation of this score
}

export interface FoundationScoreResult {
  overall_score: number
  // Stored columns in foundation_scores table
  emergency_fund_score: number
  debt_ratio_score: number
  savings_rate_score: number
  // Full factor list for display
  factors: FactorScore[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value))
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export function computeFoundationScore(profile: ProfileData): FoundationScoreResult {
  const monthlyIncome = profile.annual_income / 12

  // 1. Emergency Fund (25%)
  //    Target: 3 months of expenses in liquid savings.
  //    Score reaches 100 at 3+ months covered.
  const monthsCovered =
    profile.monthly_expenses > 0
      ? profile.liquid_savings / profile.monthly_expenses
      : 0
  const emergencyScore = clamp((monthsCovered / 3) * 100)
  const emergencyDetail =
    `${monthsCovered.toFixed(1)} months covered · ` +
    `target $${fmt(profile.monthly_expenses * 3)} (3 months)`

  // 2. Debt-to-Income (20%)
  //    DTI = monthly debt payments / monthly income.
  //    Score reaches 0 at 36% DTI (common lending cutoff).
  const dti = monthlyIncome > 0 ? profile.monthly_debt_payment / monthlyIncome : 0
  const debtRatioScore = clamp((1 - dti / 0.36) * 100)
  const debtRatioDetail =
    `${(dti * 100).toFixed(1)}% of monthly income goes to debt · target < 15%`

  // 3. Cash Flow Margin (20%)
  //    Free cash flow as % of income after all fixed obligations.
  //    Score reaches 100 at 50% free cash flow margin.
  const freeCashFlow =
    monthlyIncome - profile.monthly_expenses - profile.monthly_debt_payment
  const cashFlowMargin = monthlyIncome > 0 ? freeCashFlow / monthlyIncome : 0
  const cashFlowScore = clamp(cashFlowMargin * 200)
  const cashFlowDetail =
    freeCashFlow >= 0
      ? `$${fmt(freeCashFlow)}/month free after expenses`
      : `–$${fmt(Math.abs(freeCashFlow))}/month deficit`

  // 4. Savings Rate (15%)
  //    Liquid savings as a fraction of annual income.
  //    Score reaches 100 at 20% savings-to-income ratio.
  const savingsRate =
    profile.annual_income > 0 ? profile.liquid_savings / profile.annual_income : 0
  const savingsRateScore = clamp((savingsRate / 0.2) * 100)
  const savingsRateDetail =
    `${(savingsRate * 100).toFixed(1)}% savings-to-income · target 20%+`

  // 5. Debt Load (10%)
  //    Total debt as a multiple of annual income.
  //    Score reaches 0 at 3× annual income in debt.
  const debtMultiple =
    profile.annual_income > 0 ? profile.total_debt / profile.annual_income : 0
  const debtLoadScore = clamp(Math.max(0, 1 - debtMultiple / 3) * 100)
  const debtLoadDetail =
    `${debtMultiple.toFixed(2)}× annual income in total debt · target < 1×`

  // 6. Retirement Readiness (10%)
  //    Rule of thumb: accumulate 0.1× salary for every year past 20.
  //    E.g. age 30 → 1×, age 40 → 2×, age 50 → 3×.
  const targetMultiplier = Math.max(0.5, (profile.age - 20) * 0.1)
  const actualMultiplier =
    profile.annual_income > 0 ? profile.retirement_savings / profile.annual_income : 0
  const retirementScore = clamp((actualMultiplier / targetMultiplier) * 100)
  const retirementDetail =
    `${actualMultiplier.toFixed(1)}× salary saved · ` +
    `target at age ${profile.age}: ${targetMultiplier.toFixed(1)}×`

  // ─── Assemble factors ───────────────────────────────────────────────────────

  const factors: FactorScore[] = [
    { key: 'emergency_fund', label: 'Emergency Fund',      score: emergencyScore,    weight: 0.25, detail: emergencyDetail    },
    { key: 'debt_ratio',     label: 'Debt-to-Income',      score: debtRatioScore,    weight: 0.20, detail: debtRatioDetail    },
    { key: 'cash_flow',      label: 'Cash Flow Margin',    score: cashFlowScore,     weight: 0.20, detail: cashFlowDetail     },
    { key: 'savings_rate',   label: 'Savings Rate',        score: savingsRateScore,  weight: 0.15, detail: savingsRateDetail  },
    { key: 'debt_load',      label: 'Debt Load',           score: debtLoadScore,     weight: 0.10, detail: debtLoadDetail     },
    { key: 'retirement',     label: 'Retirement Readiness',score: retirementScore,   weight: 0.10, detail: retirementDetail   },
  ]

  const overall_score = Math.round(
    clamp(factors.reduce((sum, f) => sum + f.score * f.weight, 0))
  )

  return {
    overall_score,
    emergency_fund_score: Math.round(emergencyScore),
    debt_ratio_score:     Math.round(debtRatioScore),
    savings_rate_score:   Math.round(savingsRateScore),
    factors,
  }
}
