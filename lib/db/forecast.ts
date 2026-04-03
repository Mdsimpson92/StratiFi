import { query, queryOne } from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UpcomingCharge {
  normalized_merchant: string
  expected_date:       string   // YYYY-MM-DD
  days_until:          number   // negative = overdue
  estimated_amount:    number
}

export interface Forecast {
  upcoming_charges:    UpcomingCharge[]
  projected_spend_30d: number
  projected_income_30d: number
  projected_net_30d:   number
}

// ─── Upcoming charges ─────────────────────────────────────────────────────────
//
// For each recurring merchant (≥2 occurrences, freq 6–400 days), compute
// next_expected_date = last_transaction_date + freq_days.
// Include those falling within -7 (recently overdue) to +30 days.

async function getUpcomingCharges(user_id: string): Promise<UpcomingCharge[]> {
  const rows = await query<{
    normalized_merchant: string
    avg_amount:          string
    last_date:           string
    freq_days:           string | null
  }>(
    `SELECT
       normalized_merchant,
       ROUND(AVG(amount)::numeric, 2)    AS avg_amount,
       MAX(transaction_date)::text        AS last_date,
       ROUND(
         (MAX(transaction_date) - MIN(transaction_date))::numeric
         / NULLIF(COUNT(*) - 1, 0)
       )                                  AS freq_days
     FROM transactions
     WHERE user_id = $1
       AND amount > 0
       AND normalized_merchant IS NOT NULL
       AND transaction_date IS NOT NULL
     GROUP BY normalized_merchant
     HAVING
       COUNT(*) >= 2
       AND ROUND(
         (MAX(transaction_date) - MIN(transaction_date))::numeric
         / NULLIF(COUNT(*) - 1, 0)
       ) BETWEEN 6 AND 400`,
    [user_id]
  )

  const today    = new Date()
  today.setHours(0, 0, 0, 0)
  const charges: UpcomingCharge[] = []

  for (const row of rows) {
    if (row.freq_days === null) continue

    const freqDays  = Number(row.freq_days)
    const lastDate  = new Date(row.last_date)
    lastDate.setHours(0, 0, 0, 0)

    // How many full cycles have passed since the last charge?
    const daysSinceLast = Math.floor((today.getTime() - lastDate.getTime()) / 86_400_000)
    const cyclesPassed  = Math.floor(daysSinceLast / freqDays)

    // Next expected = last + (cycles + 1) full cycles
    const nextDate = new Date(lastDate)
    nextDate.setDate(nextDate.getDate() + (cyclesPassed + 1) * freqDays)

    const daysUntil = Math.round((nextDate.getTime() - today.getTime()) / 86_400_000)

    // Include charges due within the next 30 days or up to 7 days overdue
    if (daysUntil >= -7 && daysUntil <= 30) {
      charges.push({
        normalized_merchant: row.normalized_merchant,
        expected_date:       nextDate.toISOString().slice(0, 10),
        days_until:          daysUntil,
        estimated_amount:    Number(row.avg_amount),
      })
    }
  }

  // Sort by days_until ascending (soonest first)
  return charges.sort((a, b) => a.days_until - b.days_until)
}

// ─── Projected monthly spend/income ──────────────────────────────────────────
//
// Average monthly outflow and inflow over the last 90 days.

async function getProjectedMonthly(
  user_id: string
): Promise<{ spend: number; income: number }> {
  const row = await queryOne<{
    avg_monthly_outflow: string | null
    avg_monthly_inflow:  string | null
  }>(
    `SELECT
       ROUND(AVG(monthly_outflow)::numeric, 2) AS avg_monthly_outflow,
       ROUND(AVG(monthly_inflow)::numeric, 2)  AS avg_monthly_inflow
     FROM (
       SELECT
         TO_CHAR(transaction_date, 'YYYY-MM')              AS month,
         SUM(CASE WHEN amount > 0 THEN amount  ELSE 0 END) AS monthly_outflow,
         SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) AS monthly_inflow
       FROM transactions
       WHERE user_id = $1
         AND transaction_date IS NOT NULL
         AND transaction_date >= CURRENT_DATE - INTERVAL '90 days'
       GROUP BY month
     ) monthly`,
    [user_id]
  )

  return {
    spend:  Number(row?.avg_monthly_outflow ?? 0),
    income: Number(row?.avg_monthly_inflow  ?? 0),
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function getForecast(user_id: string): Promise<Forecast> {
  const [upcoming_charges, monthly] = await Promise.all([
    getUpcomingCharges(user_id),
    getProjectedMonthly(user_id),
  ])

  return {
    upcoming_charges,
    projected_spend_30d:  monthly.spend,
    projected_income_30d: monthly.income,
    projected_net_30d:    Math.round((monthly.income - monthly.spend) * 100) / 100,
  }
}
