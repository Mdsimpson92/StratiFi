// ─── Demo Mode ────────────────────────────────────────────────────────────────
//
// Production-safe, per-user demo mode.  Automatically activates for signed-in
// users who have zero real transactions.  Once the user uploads data or links a
// bank account, demo mode is disabled — no cleanup required.
//
// The demo data is never written to the database.  Each API route calls
// `demoGuard(userId, data)` which short-circuits with a JSON response when the
// user qualifies.  The dashboard receives an `is_demo` flag from the stripe
// subscription endpoint so it can render a visible banner.
//
// To remove demo mode entirely:
//   1. Delete this file
//   2. Remove the `demoGuard` call (one line) from each API route
//   3. Remove the `is_demo` field from /api/stripe/subscription
//   4. Remove the demo banner/state from app/page.tsx

import { NextResponse } from 'next/server'
import { queryOne }     from '@/lib/db/client'

// ─── Per-user detection ───────────────────────────────────────────────────────

/**
 * True when the user has no real financial data.
 * A user exits demo mode when they either:
 *   - Upload transactions with valid dates, OR
 *   - Link a bank account via Plaid
 */
export async function isDemoUser(userId: string): Promise<boolean> {
  try {
    const row = await queryOne<{ has_real_data: boolean }>(
      `SELECT (
        EXISTS(SELECT 1 FROM transactions WHERE user_id = $1 AND date IS NOT NULL LIMIT 1)
        OR EXISTS(SELECT 1 FROM plaid_items WHERE user_id = $1 LIMIT 1)
      ) AS has_real_data`,
      [userId]
    )
    return !(row?.has_real_data ?? false)
  } catch {
    // If the DB is unreachable, fall through to real logic rather than blocking the user
    return false
  }
}

// ─── Route helper ─────────────────────────────────────────────────────────────

/**
 * If the user has no real data, returns a NextResponse with demo data.
 * Otherwise returns null so the route continues with real logic.
 */
export async function demoGuard<T>(userId: string, data: T): Promise<NextResponse | null> {
  if (await isDemoUser(userId)) {
    return NextResponse.json(data)
  }
  return null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD relative to today (negative = future). */
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function monthStr(monthsAgo: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - monthsAgo)
  return d.toISOString().slice(0, 7)
}

function isoAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

// ─── Demo Dataset ─────────────────────────────────────────────────────────────
//
// Financial profile ($75k total portfolio):
//   Checking: $12,500 | Savings: $18,000 | Investments: $35,000
//   Monthly income: $5,200 | Monthly expenses: $3,800
//   Debt: $9,500 student loans ($280/mo)
//   Age 28, single.  Goal: wealth_building.
//   Net worth ≈ $100k.  Goal: wealth_building.
//
// All values are functions of "now" so dates stay fresh across restarts.

export function getDemoInsights() {
  return {
    insights: [
      { text: 'You spent 14% less this month than last — your biggest drop was in shopping.',                       type: 'spending_shift',      hint: 'Keep it up to boost your savings rate.',                     tab: 'overview' as const },
      { text: 'Groceries is your top category at $640 — that\u2019s about average for a single-person household.',  type: 'top_category',        hint: 'Meal-prepping weekdays can shave another 15%.',              tab: 'overview' as const },
      { text: 'You tend to spend the most on Saturdays — dining out drives most of it.',                            type: 'day_pattern',         hint: 'Try a no-spend Saturday once a month.',                      tab: 'overview' as const },
      { text: 'Your subscription costs rose $5 from last month due to a Spotify price increase.',                   type: 'subscription_change', hint: 'Review your subscriptions tab for details.',                 tab: 'subscriptions' as const },
      { text: 'Positive cash flow for 3 consecutive months — you\u2019re building momentum.',                       type: 'cashflow_positive',   hint: 'Consider auto-transferring the surplus to savings.',         tab: 'overview' as const },
    ],
  }
}

export function getDemoCashflow() {
  return {
    by_month: [
      { month: monthStr(2), inflow: 5200, outflow: 4100, net: 1100 },
      { month: monthStr(1), inflow: 5200, outflow: 3950, net: 1250 },
      { month: monthStr(0), inflow: 5200, outflow: 3800, net: 1400 },
    ],
    total_inflow:  15600,
    total_outflow: 11850,
    net:           3750,
  }
}

export function getDemoPatterns() {
  return {
    patterns: [
      { normalized_merchant: 'Netflix',          transaction_count: 3, average_amount: 15.49,   last_transaction_date: daysAgo(5),  estimated_frequency_days: 30 },
      { normalized_merchant: 'Spotify',          transaction_count: 3, average_amount: 11.99,   last_transaction_date: daysAgo(8),  estimated_frequency_days: 30 },
      { normalized_merchant: 'Planet Fitness',   transaction_count: 3, average_amount: 29.99,   last_transaction_date: daysAgo(12), estimated_frequency_days: 30 },
      { normalized_merchant: 'iCloud Storage',   transaction_count: 3, average_amount: 2.99,    last_transaction_date: daysAgo(18), estimated_frequency_days: 30 },
      { normalized_merchant: 'Verizon Wireless', transaction_count: 3, average_amount: 85.00,   last_transaction_date: daysAgo(2),  estimated_frequency_days: 30 },
      { normalized_merchant: 'State Farm',       transaction_count: 3, average_amount: 145.00,  last_transaction_date: daysAgo(20), estimated_frequency_days: 30 },
      { normalized_merchant: 'Xfinity',          transaction_count: 3, average_amount: 70.00,   last_transaction_date: daysAgo(15), estimated_frequency_days: 30 },
      { normalized_merchant: 'Trader Joe\u2019s',transaction_count: 9, average_amount: 71.00,   last_transaction_date: daysAgo(3),  estimated_frequency_days: 10 },
    ],
  }
}

export function getDemoAnomalies() {
  return {
    anomalies: [
      { id: 'demo-a1', normalized_merchant: 'Best Buy',          amount: 549.99, merchant_average: 65.00,  anomaly_ratio: 8.5, transaction_date: daysAgo(14) },
      { id: 'demo-a2', normalized_merchant: 'Trader Joe\u2019s', amount: 198.42, merchant_average: 71.00,  anomaly_ratio: 2.8, transaction_date: daysAgo(3)  },
    ],
  }
}

export function getDemoSpendingSummary() {
  return {
    by_category: [
      { category: 'food',           total_spent: 2280, transaction_count: 32, average_amount: 71.25  },
      { category: 'bills',          total_spent: 2700, transaction_count: 12, average_amount: 225.00 },
      { category: 'subscriptions',  total_spent: 195,  transaction_count: 12, average_amount: 16.25  },
      { category: 'shopping',       total_spent: 1050, transaction_count: 9,  average_amount: 116.67 },
      { category: 'entertainment',  total_spent: 480,  transaction_count: 14, average_amount: 34.29  },
      { category: 'transport',      total_spent: 390,  transaction_count: 6,  average_amount: 65.00  },
      { category: 'gas',            total_spent: 330,  transaction_count: 10, average_amount: 33.00  },
      { category: 'health',         total_spent: 210,  transaction_count: 3,  average_amount: 70.00  },
      { category: 'automotive',     total_spent: 165,  transaction_count: 2,  average_amount: 82.50  },
      { category: 'other',          total_spent: 120,  transaction_count: 5,  average_amount: 24.00  },
    ],
  }
}

export function getDemoPlaidAccounts() {
  return { accounts: [] }   // demo users have NOT linked a real bank
}

export function getDemoSubscriptions() {
  return {
    subscriptions: [
      { normalized_merchant: 'Netflix',        category: 'subscriptions', transaction_count: 3, average_amount: 15.49,  last_transaction_date: daysAgo(5),  days_since_last: 5,  estimated_frequency_days: 30, estimated_monthly_cost: 15.49,  confidence: 95 },
      { normalized_merchant: 'Spotify',        category: 'subscriptions', transaction_count: 3, average_amount: 11.99,  last_transaction_date: daysAgo(8),  days_since_last: 8,  estimated_frequency_days: 30, estimated_monthly_cost: 11.99,  confidence: 95 },
      { normalized_merchant: 'Planet Fitness', category: 'subscriptions', transaction_count: 3, average_amount: 29.99,  last_transaction_date: daysAgo(12), days_since_last: 12, estimated_frequency_days: 30, estimated_monthly_cost: 29.99,  confidence: 92 },
      { normalized_merchant: 'iCloud Storage', category: 'subscriptions', transaction_count: 3, average_amount: 2.99,   last_transaction_date: daysAgo(18), days_since_last: 18, estimated_frequency_days: 30, estimated_monthly_cost: 2.99,   confidence: 90 },
      { normalized_merchant: 'Xfinity',        category: 'subscriptions', transaction_count: 3, average_amount: 70.00,  last_transaction_date: daysAgo(15), days_since_last: 15, estimated_frequency_days: 30, estimated_monthly_cost: 70.00,  confidence: 88 },
      { normalized_merchant: 'ChatGPT Plus',   category: 'subscriptions', transaction_count: 2, average_amount: 20.00,  last_transaction_date: daysAgo(22), days_since_last: 22, estimated_frequency_days: 30, estimated_monthly_cost: 20.00,  confidence: 85 },
      { normalized_merchant: 'Adobe CC',       category: 'subscriptions', transaction_count: 2, average_amount: 54.99,  last_transaction_date: daysAgo(52), days_since_last: 52, estimated_frequency_days: 30, estimated_monthly_cost: 54.99,  confidence: 78 },
    ],
    total_monthly_cost: 225.45,
    top_3: [
      { normalized_merchant: 'Xfinity',        category: 'subscriptions', transaction_count: 3, average_amount: 70.00,  last_transaction_date: daysAgo(15), days_since_last: 15, estimated_frequency_days: 30, estimated_monthly_cost: 70.00,  confidence: 88 },
      { normalized_merchant: 'Adobe CC',       category: 'subscriptions', transaction_count: 2, average_amount: 54.99,  last_transaction_date: daysAgo(52), days_since_last: 52, estimated_frequency_days: 30, estimated_monthly_cost: 54.99,  confidence: 78 },
      { normalized_merchant: 'Planet Fitness', category: 'subscriptions', transaction_count: 3, average_amount: 29.99,  last_transaction_date: daysAgo(12), days_since_last: 12, estimated_frequency_days: 30, estimated_monthly_cost: 29.99,  confidence: 92 },
    ],
    waste_flags: [
      { merchant: 'Adobe CC', reason: 'No charge in 52 days \u2014 may be inactive' },
    ],
  }
}

export function getDemoForecast() {
  return {
    upcoming_charges: [
      { normalized_merchant: 'Netflix',          expected_date: daysAgo(-25), days_until: 25, estimated_amount: 15.49  },
      { normalized_merchant: 'Spotify',          expected_date: daysAgo(-22), days_until: 22, estimated_amount: 11.99  },
      { normalized_merchant: 'Planet Fitness',   expected_date: daysAgo(-18), days_until: 18, estimated_amount: 29.99  },
      { normalized_merchant: 'Verizon Wireless', expected_date: daysAgo(-28), days_until: 28, estimated_amount: 85.00  },
      { normalized_merchant: 'State Farm',       expected_date: daysAgo(-10), days_until: 10, estimated_amount: 145.00 },
      { normalized_merchant: 'Xfinity',          expected_date: daysAgo(-15), days_until: 15, estimated_amount: 70.00  },
      { normalized_merchant: 'ChatGPT Plus',     expected_date: daysAgo(-8),  days_until: 8,  estimated_amount: 20.00  },
    ],
    projected_spend_30d:  3800,
    projected_income_30d: 5200,
    projected_net_30d:    1400,
  }
}

export function getDemoAlerts() {
  return [
    { alert_key: 'spending_spike:shopping',  type: 'spending_spike',   severity: 'medium' as const, message: 'Shopping spending jumped 48% vs last month \u2014 a Best Buy purchase drove most of it.',    read: false, dismissed: false, trigger_event: 'Best Buy $549.99',    triggered_at: isoAgo(2),  sent: false },
    { alert_key: 'bills_due:state_farm',     type: 'bills_due',        severity: 'low' as const,    message: 'State Farm auto insurance ($145) is due in about 10 days.',                                 read: false, dismissed: false, trigger_event: 'State Farm recurring', triggered_at: isoAgo(1),  sent: false },
    { alert_key: 'new_subscription:chatgpt', type: 'new_subscription', severity: 'low' as const,    message: 'New recurring charge detected: ChatGPT Plus at $20/mo.',                                    read: true,  dismissed: false, trigger_event: 'ChatGPT Plus $20.00',  triggered_at: isoAgo(22), sent: false },
    { alert_key: 'price_increase:spotify',   type: 'price_increase',   severity: 'medium' as const, message: 'Spotify increased from $10.99 to $11.99/mo \u2014 a 9% price hike.',                        read: false, dismissed: false, trigger_event: 'Spotify price change', triggered_at: isoAgo(8),  sent: false },
  ]
}

// Top 3 unified actions: capital allocation focus
export function getDemoRecommendations() {
  return {
    recommendations: [
      { id: 'demo-r1', type: 'capital_reallocation',             priority: 'high' as const,   title: 'Move $8,000 idle cash into investments',             explanation: 'You have $30,500 in cash but only need $22,800 (6 months expenses). $8,000 is earning near-zero return.', suggested_action: 'Transfer $8,000 to a low-cost index fund. At 7% annual return, this becomes $31,000 in 20 years.', savings_amount: undefined },
      { id: 'demo-r2', type: 'subscription_savings_opportunity', priority: 'high' as const,   title: 'Eliminate $55/mo in unused subscriptions',           explanation: 'Adobe CC has had no activity in 52 days. That\u2019s $660/year in idle spend.',               suggested_action: 'Cancel at adobe.com/account. Redirect the $55/mo to your investment account.',  savings_amount: 55  },
      { id: 'demo-r3', type: 'debt_acceleration',                priority: 'medium' as const, title: 'Accelerate debt payoff \u2014 save $1,200 in interest', explanation: 'You have $1,400/mo free cash flow but only pay $280/mo on $9,500 debt. Adding $220/mo clears it 2 years faster.', suggested_action: 'Increase monthly debt payment to $500. Total interest saved: $1,200.', savings_amount: 220 },
    ],
  }
}

export function getDemoCheckin() {
  return { due: false }
}

// Demo Allocation: $75k total portfolio
// Checking $12.5k + Savings $18k + Investments $35k - Debt $9.5k = $56k net
export function getDemoAllocation() {
  return {
    allocation: {
      net_worth:          56000,
      liquid_savings:     30500,   // checking + savings
      retirement_savings: 35000,   // investments
      total_debt:         9500,
      monthly_income:     5200,
      monthly_expenses:   3800,
      buckets: [
        { label: 'Cash Reserves',   value: 30500, target: 22800, color: '#2ab9b0' },  // 6mo expenses
        { label: 'Investments',     value: 35000, target: 62400, color: '#1e3166' },  // 1x annual income
        { label: 'Debt',            value: 9500,  target: 0,     color: '#ef4444' },
      ],
    },
  }
}

// Demo Foundation Score: 72/100 "Good" — solid base, clear room to optimize
// Matches demo: $12.5k checking + $18k savings, $35k investments, $9.5k debt
export function getDemoScore() {
  return {
    score: {
      overall:              72,
      emergency_fund_score: 100,  // $30.5k liquid / $3,800 = 8 months → capped at 100
      debt_ratio_score:     85,   // $280/$5,200 = 5.4% DTI → strong
      savings_rate_score:   78,   // $30.5k/$62.4k = 49% → good but not maxed
      label:                'Good',
      trend:                4,
      calculated_at:        new Date().toISOString(),
    },
  }
}
