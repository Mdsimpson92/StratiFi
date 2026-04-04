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
// Income detection: either negative amount (bank convention) OR direction='credit'
// Expense detection: positive amount with direction='debit' or NULL direction
// Uses COALESCE(date, transaction_date) to support both column names

const INFLOW_CASE = `CASE WHEN amount < 0 THEN ABS(amount) WHEN direction = 'credit' THEN amount ELSE 0 END`
const OUTFLOW_CASE = `CASE WHEN amount > 0 AND (direction IS NULL OR direction = 'debit') THEN amount ELSE 0 END`
const DATE_COL = `COALESCE(date, transaction_date)`

export async function getCashflow(
  user_id: string,
  options: { start_date?: string; end_date?: string } = {}
): Promise<CashflowSummary> {
  const params: unknown[] = [user_id]
  const dateFilters: string[] = [`amount IS NOT NULL`, `${DATE_COL} IS NOT NULL`]

  if (options.start_date) {
    params.push(options.start_date)
    dateFilters.push(`${DATE_COL} >= $${params.length}`)
  }
  if (options.end_date) {
    params.push(options.end_date)
    dateFilters.push(`${DATE_COL} <= $${params.length}`)
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
         TO_CHAR(DATE_TRUNC('month', ${DATE_COL}), 'YYYY-MM')          AS month,
         ROUND(SUM(${INFLOW_CASE})::numeric, 2)                        AS inflow,
         ROUND(SUM(${OUTFLOW_CASE})::numeric, 2)                       AS outflow,
         ROUND((SUM(${INFLOW_CASE}) - SUM(${OUTFLOW_CASE}))::numeric, 2) AS net
       FROM transactions
       WHERE ${where}
       GROUP BY DATE_TRUNC('month', ${DATE_COL})
       ORDER BY DATE_TRUNC('month', ${DATE_COL})`,
      params
    ),

    queryOne<{
      total_inflow:  string
      total_outflow: string
      net:           string
    }>(
      `SELECT
         ROUND(SUM(${INFLOW_CASE})::numeric, 2)                           AS total_inflow,
         ROUND(SUM(${OUTFLOW_CASE})::numeric, 2)                          AS total_outflow,
         ROUND((SUM(${INFLOW_CASE}) - SUM(${OUTFLOW_CASE}))::numeric, 2)  AS net
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
