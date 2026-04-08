// ─── StratiFi AI Orchestrator ─────────────────────────────────────────────────
//
// Runs three AI agents in sequence against the user's financial data:
//   1. Explainability  → "What is happening"
//   2. Behavioral      → "What is wrong"
//   3. Recommendation  → "What to do next"
//
// Each agent receives the user's real financial data plus output from prior agents.
// The orchestrator merges results into a single structured analysis.

import { runAgent } from '@/lib/ai/run-agent'
import { checkCompliance, addDisclaimer } from '@/lib/ai/safety-check'
import { readFileSync } from 'fs'
import { join } from 'path'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FinancialSnapshot {
  score: { overall: number; label: string; emergency_fund_score: number; debt_ratio_score: number; savings_rate_score: number } | null
  cashflow: { total_inflow: number; total_outflow: number; net: number; by_month: { month: string; inflow: number; outflow: number; net: number }[] } | null
  subscriptions: { total_monthly_cost: number; subscriptions: { normalized_merchant: string; estimated_monthly_cost: number }[]; waste_flags: { merchant: string; reason: string }[] } | null
  recommendations: { id: string; title: string; explanation: string; suggested_action: string; savings_amount?: number }[]
  alerts: { type: string; severity: string; message: string }[]
  categories: { category: string; total_spent: number; transaction_count: number }[]
  allocation: { net_worth: number; liquid_savings: number; retirement_savings: number; total_debt: number; monthly_income: number; monthly_expenses: number } | null
}

export interface AIAnalysis {
  situation: {
    summary: string
    score_explanation: string
    key_metrics: { label: string; value: string; explanation: string }[]
  }
  problems: {
    type: string
    title: string
    detail: string
    monthly_impact: number | null
    severity: string
  }[]
  actions: {
    priority: number
    verb: string
    instruction: string
    expected_savings: number | null
    expected_score_impact: string | null
    timeframe: string
  }[]
  disclaimer: string
}

// ─── Prompt Loader ────────────────────────────────────────────────────────────

const PROMPT_DIR = join(process.cwd(), 'agents', 'prompts')

function loadPrompt(name: string): string {
  try {
    return readFileSync(join(PROMPT_DIR, `${name}.prompt.md`), 'utf8')
  } catch {
    throw new Error(`Prompt file not found: ${name}.prompt.md`)
  }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function runAnalysis(snapshot: FinancialSnapshot): Promise<AIAnalysis> {
  // Step 1: Explainability — "What is happening"
  const explainResult = await runAgent<{
    situation_summary: string
    score_explanation: string
    key_metrics: { label: string; value: string; explanation: string }[]
  }>({
    prompt: loadPrompt('explainability'),
    data: {
      score: snapshot.score,
      cashflow: snapshot.cashflow,
      allocation: snapshot.allocation,
      categories: snapshot.categories,
    },
  })

  // Step 2: Behavioral Finance — "What is wrong"
  const behavioralResult = await runAgent<{
    patterns: { type: string; title: string; detail: string; monthly_impact: number | null; severity: string }[]
  }>({
    prompt: loadPrompt('behavioral-finance'),
    data: {
      cashflow: snapshot.cashflow,
      subscriptions: snapshot.subscriptions,
      categories: snapshot.categories,
      alerts: snapshot.alerts,
      existing_recommendations: snapshot.recommendations,
    },
  })

  // Step 3: Recommendation Translator — "What to do next"
  const actionResult = await runAgent<{
    actions: { priority: number; verb: string; instruction: string; expected_savings: number | null; expected_score_impact: string | null; timeframe: string }[]
  }>({
    prompt: loadPrompt('recommendation'),
    data: {
      score: snapshot.score,
      problems: behavioralResult.output.patterns,
      existing_recommendations: snapshot.recommendations,
      subscriptions: snapshot.subscriptions,
      allocation: snapshot.allocation,
    },
  })

  // Compliance check on all text output
  const allText = [
    explainResult.output.situation_summary,
    explainResult.output.score_explanation,
    ...behavioralResult.output.patterns.map(p => p.detail),
    ...actionResult.output.actions.map(a => a.instruction),
  ].join(' ')

  const safety = checkCompliance(allText)
  if (!safety.safe) {
    console.warn('[ai-orchestrator] compliance flags:', safety.flagged)
  }

  return {
    situation: {
      summary: explainResult.output.situation_summary,
      score_explanation: explainResult.output.score_explanation,
      key_metrics: explainResult.output.key_metrics ?? [],
    },
    problems: behavioralResult.output.patterns ?? [],
    actions: actionResult.output.actions ?? [],
    disclaimer: 'For informational purposes only. Not financial, tax, or legal advice.',
  }
}
