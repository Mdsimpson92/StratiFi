import { query, queryOne } from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CashflowMonth {
  month:        string   // 'YYYY-MM'
  inflow:       number
  outflow:      number
  net:          number
}

export interface CashflowSummary {
  by_month:       CashflowMonth[]
  total_inflow:   number
  total_outflow:  number
  net:            number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Inflow:  negative amounts (credits — money coming in, e.g. payroll, refunds)
// Outflow: positive amounts (debits — money going out)

export async function getCashflow(
  user_id: string,
  options: { start_date?: string; end_date?: string } = {}
): Promise<CashflowSummary> {
  const params: unknown[] = [user_id]
  const dateFilters: string[] = ['amount IS NOT NULL', 'transaction_date IS NOT NULL']

  if (options.start_date) {
    params.push(options.start_date)
    dateFilters.push(`transaction_date >= $${params.length}`)
  }
  if (options.end_date) {
    params.push(options.end_date)
    dateFilters.push(`transaction_date <= $${params.length}`)
  }

  const where = `user_id = $1 AND ${dateFilters.join(' AND ')}`

  const [byMonth, totals] = await Promise.all([

    query<{
      month:   string
      inflow:  string
      outflow: string
      net:     string
    }>(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', transaction_date), 'YYYY-MM')                  AS month,
         ROUND(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END)::numeric, 2)   AS inflow,
         ROUND(SUM(CASE WHEN amount > 0 THEN amount      ELSE 0 END)::numeric, 2)   AS outflow,
         ROUND(
           SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) -
           SUM(CASE WHEN amount > 0 THEN amount      ELSE 0 END)
         ::numeric, 2)                                                               AS net
       FROM transactions
       WHERE ${where}
       GROUP BY DATE_TRUNC('month', transaction_date)
       ORDER BY DATE_TRUNC('month', transaction_date)`,
      params
    ),

    queryOne<{
      total_inflow:  string
      total_outflow: string
      net:           string
    }>(
      `SELECT
         ROUND(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END)::numeric, 2)  AS total_inflow,
         ROUND(SUM(CASE WHEN amount > 0 THEN amount      ELSE 0 END)::numeric, 2)  AS total_outflow,
         ROUND(
           SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) -
           SUM(CASE WHEN amount > 0 THEN amount      ELSE 0 END)
         ::numeric, 2)                                                              AS net
       FROM transactions
       WHERE ${where}`,
      params
    ),

  ])

  return {
    by_month: byMonth.map(row => ({
      ...row,
      inflow:  Number(row.inflow),
      outflow: Number(row.outflow),
      net:     Number(row.net),
    })),
    total_inflow:  Number(totals?.total_inflow  ?? 0),
    total_outflow: Number(totals?.total_outflow ?? 0),
    net:           Number(totals?.net           ?? 0),
  }
}
