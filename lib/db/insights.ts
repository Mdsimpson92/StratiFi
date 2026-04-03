import { query, queryOne } from './client'
import { getCashflow } from './cashflow'
import { getRecurringTransactions } from './patterns'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CategorySummary {
  category:          string
  total_spent:       number
  transaction_count: number
  average_amount:    number
}

export interface SpendingSummary {
  by_category:               CategorySummary[]
  total_spent:               number
  highest_spending_category: string | null
  most_frequent_merchant:    string | null
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface SpendingSummaryOptions {
  start_date?: string  // ISO: 'YYYY-MM-DD'
  end_date?:   string  // ISO: 'YYYY-MM-DD'
}

// ─── Query ────────────────────────────────────────────────────────────────────

export async function getSpendingSummary(
  user_id: string,
  options: SpendingSummaryOptions = {}
): Promise<SpendingSummary> {
  // Build parameterized WHERE clause shared across all three queries
  const params: unknown[] = [user_id]
  const dateFilters: string[] = ['amount IS NOT NULL', 'amount > 0']

  if (options.start_date) {
    params.push(options.start_date)
    dateFilters.push(`transaction_date >= $${params.length}`)
  }
  if (options.end_date) {
    params.push(options.end_date)
    dateFilters.push(`transaction_date <= $${params.length}`)
  }

  const where = `user_id = $1 AND ${dateFilters.join(' AND ')}`

  const [byCategory, totals, topMerchant] = await Promise.all([

    // Breakdown by category
    query<{
      category:          string
      total_spent:       string
      transaction_count: string
      average_amount:    string
    }>(
      `SELECT
         COALESCE(category, 'uncategorized')  AS category,
         ROUND(SUM(amount)::numeric, 2)       AS total_spent,
         COUNT(*)                             AS transaction_count,
         ROUND(AVG(amount)::numeric, 2)       AS average_amount
       FROM transactions
       WHERE ${where}
       GROUP BY category
       ORDER BY SUM(amount) DESC`,
      params
    ),

    // Overall totals + highest spending category
    queryOne<{
      total_spent:               string
      highest_spending_category: string | null
    }>(
      `SELECT
         ROUND(SUM(amount)::numeric, 2) AS total_spent,
         (
           SELECT COALESCE(category, 'uncategorized')
           FROM transactions
           WHERE ${where}
           GROUP BY category
           ORDER BY SUM(amount) DESC
           LIMIT 1
         ) AS highest_spending_category
       FROM transactions
       WHERE ${where}`,
      params
    ),

    // Most frequent normalized merchant
    queryOne<{ merchant: string }>(
      `SELECT normalized_merchant AS merchant
       FROM transactions
       WHERE ${where}
         AND normalized_merchant IS NOT NULL
       GROUP BY normalized_merchant
       ORDER BY COUNT(*) DESC
       LIMIT 1`,
      params
    ),

  ])

  return {
    by_category: byCategory.map(r => ({
      category:          r.category,
      total_spent:       Number(r.total_spent),
      transaction_count: Number(r.transaction_count),
      average_amount:    Number(r.average_amount),
    })),
    total_spent:               Number(totals?.total_spent ?? 0),
    highest_spending_category: totals?.highest_spending_category ?? null,
    most_frequent_merchant:    topMerchant?.merchant ?? null,
  }
}

// ─── Insights ─────────────────────────────────────────────────────────────────

function monthBounds(offsetMonths = 0): { start_date: string; end_date: string } {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() - offsetMonths

  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)

  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { start_date: fmt(first), end_date: fmt(last) }
}

// Title-case a normalized merchant name: "whole foods" → "Whole Foods"
function titleCase(s: string): string {
  return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export interface Insight {
  text: string
  type: string
  hint: string
  tab:  'overview' | 'subscriptions' | null
}

export async function getInsights(user_id: string): Promise<Insight[]> {
  const thisMonth = monthBounds(0)
  const lastMonth = monthBounds(1)

  const [
    cashflowThis,
    cashflowLast,
    summaryThis,
    recurring,
    dowRow,
    dowAvgRow,
    paydayRow,
    subChange,
  ] = await Promise.all([
    getCashflow(user_id, thisMonth),
    getCashflow(user_id, lastMonth),
    getSpendingSummary(user_id, thisMonth),
    getRecurringTransactions(user_id),

    // Highest-spend day of week this month
    queryOne<{ day_name: string; total: string }>(
      `SELECT
         TRIM(TO_CHAR(transaction_date, 'Day')) AS day_name,
         SUM(amount)                            AS total
       FROM transactions
       WHERE user_id = $1
         AND amount > 0
         AND transaction_date IS NOT NULL
         AND transaction_date BETWEEN $2 AND $3
       GROUP BY TO_CHAR(transaction_date, 'Day'), EXTRACT(DOW FROM transaction_date)
       ORDER BY SUM(amount) DESC
       LIMIT 1`,
      [user_id, thisMonth.start_date, thisMonth.end_date]
    ),

    // Average spend per day-of-week this month (for DOW confidence threshold)
    queryOne<{ avg_dow_total: string }>(
      `SELECT AVG(dow_total) AS avg_dow_total
       FROM (
         SELECT EXTRACT(DOW FROM transaction_date) AS dow, SUM(amount) AS dow_total
         FROM transactions
         WHERE user_id = $1
           AND amount > 0
           AND transaction_date IS NOT NULL
           AND transaction_date BETWEEN $2 AND $3
         GROUP BY dow
       ) d`,
      [user_id, thisMonth.start_date, thisMonth.end_date]
    ),

    // Payday effect: avg daily spend overall vs 1–3 days after income
    queryOne<{ avg_spend: string | null; post_spend: string | null }>(
      `WITH income_dates AS (
         SELECT DISTINCT transaction_date AS income_date
         FROM transactions
         WHERE user_id = $1
           AND category = 'income'
           AND transaction_date IS NOT NULL
       ),
       avg_daily AS (
         SELECT AVG(daily_total) AS avg_spend
         FROM (
           SELECT transaction_date, SUM(amount) AS daily_total
           FROM transactions
           WHERE user_id = $1 AND amount > 0
           GROUP BY transaction_date
         ) d
       ),
       post_payday AS (
         SELECT AVG(daily_total) AS post_spend
         FROM (
           SELECT t.transaction_date, SUM(t.amount) AS daily_total
           FROM transactions t
           JOIN income_dates i
             ON t.transaction_date BETWEEN i.income_date + 1 AND i.income_date + 3
           WHERE t.user_id = $1 AND t.amount > 0
           GROUP BY t.transaction_date
         ) d
       )
       SELECT avg_daily.avg_spend, post_payday.post_spend
       FROM avg_daily, post_payday`,
      [user_id]
    ),

    // Subscription count: this month vs last month
    queryOne<{ this_count: string; last_count: string }>(
      `SELECT
         COUNT(DISTINCT CASE WHEN transaction_date BETWEEN $2 AND $3 THEN normalized_merchant END) AS this_count,
         COUNT(DISTINCT CASE WHEN transaction_date BETWEEN $4 AND $5 THEN normalized_merchant END) AS last_count
       FROM transactions
       WHERE user_id = $1
         AND category = 'subscriptions'
         AND normalized_merchant IS NOT NULL`,
      [user_id, thisMonth.start_date, thisMonth.end_date, lastMonth.start_date, lastMonth.end_date]
    ),
  ])

  // Candidates are scored and sorted by priority — first 5 that pass their
  // confidence threshold are returned.
  const candidates: Array<{ priority: number; text: string; type: string; hint: string; tab: 'overview' | 'subscriptions' | null }> = []

  const totalExpenses = cashflowThis.total_outflow
  const cats          = summaryThis.by_category

  // ── Priority 1: Overspent / saved ────────────────────────────────────────
  if (cashflowThis.total_inflow > 0 && cashflowThis.total_outflow > 0) {
    const net = cashflowThis.net
    if (net < 0) {
      candidates.push({
        priority: 1,
        type: 'cashflow_negative',
        text: `You spent $${Math.round(Math.abs(net)).toLocaleString()} more than you earned this month.`,
        hint: 'Review your Cashflow section to see which categories pushed you over.',
        tab:  'overview',
      })
    } else if (net > 0) {
      candidates.push({
        priority: 1,
        type: 'cashflow_positive',
        text: `You saved $${Math.round(net).toLocaleString()} this month — nice work.`,
        hint: 'Check your Spending Breakdown to see what helped you stay under budget.',
        tab:  'overview',
      })
    }
  }

  // ── Priority 2: Payday effect (≥1.5x threshold) ──────────────────────────
  if (paydayRow?.avg_spend && paydayRow?.post_spend) {
    const avg  = Number(paydayRow.avg_spend)
    const post = Number(paydayRow.post_spend)
    if (avg > 0 && post >= avg * 1.5) {
      candidates.push({
        priority: 2,
        type: 'payday',
        text: `You tend to spend more in the days right after payday.`,
        hint: 'Planning purchases in advance can help you avoid impulse spending after payday.',
        tab:  null,
      })
    }
  }

  // ── Priority 3: Top spending categories ──────────────────────────────────
  if (totalExpenses > 0 && cats.length >= 2) {
    const top3  = cats.slice(0, 3)
    const parts = top3.map(c => {
      const pct = Math.round((c.total_spent / totalExpenses) * 100)
      return `${c.category} (${pct}%)`
    })
    const list =
      parts.length === 1 ? parts[0]
      : parts.length === 2 ? `${parts[0]} and ${parts[1]}`
      : `${parts[0]}, ${parts[1]}, and ${parts[2]}`
    candidates.push({
      priority: 3,
      type: 'categories',
      text: `This month you spent most on ${list}.`,
      hint: 'Tap a slice in the Spending by Category chart to drill into any category.',
      tab:  'overview',
    })
  }

  // ── Priority 4: Subscription spend or count change ───────────────────────
  if (subChange) {
    const thisCount = Number(subChange.this_count)
    const lastCount = Number(subChange.last_count)
    if (lastCount > 0 && thisCount !== lastCount) {
      const dir = thisCount > lastCount ? 'added' : 'dropped'
      const delta = Math.abs(thisCount - lastCount)
      candidates.push({
        priority: 4,
        type: 'subscriptions',
        text: `You ${dir} ${delta} subscription${delta > 1 ? 's' : ''} compared to last month.`,
        hint: 'Head to Subscriptions to review what changed and flag anything you no longer need.',
        tab:  'subscriptions',
      })
    } else {
      const subCat = cats.find(c => c.category === 'subscriptions')
      if (subCat && subCat.total_spent > 0) {
        candidates.push({
          priority: 4,
          type: 'subscriptions',
          text: `Your subscriptions cost $${subCat.total_spent.toFixed(2)} this month.`,
          hint: 'Review your Subscriptions tab to spot anything you can cut.',
          tab:  'subscriptions',
        })
      }
    }
  }

  // ── Priority 5: Month-over-month spending change ──────────────────────────
  if (cashflowLast.total_outflow > 0 && cashflowThis.total_outflow > 0) {
    const pct = Math.round(
      ((cashflowThis.total_outflow - cashflowLast.total_outflow) / cashflowLast.total_outflow) * 100
    )
    if (Math.abs(pct) >= 5) {
      const dir = pct > 0 ? 'up' : 'down'
      candidates.push({
        priority: 5,
        type: 'mom_spending',
        text: `Your spending is ${dir} ${Math.abs(pct)}% from last month.`,
        hint: 'Compare month-by-month in your Cashflow table to see where the shift happened.',
        tab:  'overview',
      })
    }
  }

  // ── Priority 6: Day-of-week (only if top day is ≥1.5x the DOW average) ───
  if (dowRow && dowAvgRow) {
    const topTotal = Number(dowRow.total)
    const avgTotal = Number(dowAvgRow.avg_dow_total)
    if (avgTotal > 0 && topTotal >= avgTotal * 1.5) {
      candidates.push({
        priority: 6,
        type: 'day_of_week',
        text: `${dowRow.day_name}s are your biggest spending day.`,
        hint: 'Knowing your peak day helps you plan ahead and avoid unplanned purchases.',
        tab:  null,
      })
    }
  }

  // ── Priority 7: Top recurring merchant (fallback filler) ─────────────────
  if (recurring.length > 0) {
    const top = recurring.reduce((a, b) =>
      b.transaction_count > a.transaction_count ? b : a
    )
    candidates.push({
      priority: 7,
      type: 'recurring',
      text: `${titleCase(top.normalized_merchant)} is your most consistent recurring charge.`,
      hint: 'Check Subscriptions & Money Leaks to see if this is worth keeping.',
      tab:  'subscriptions',
    })
  }

  return candidates
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5)
    .map(({ text, type, hint, tab }) => ({ text, type, hint, tab }))
}
