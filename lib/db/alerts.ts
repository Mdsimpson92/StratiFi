import { query, queryOne } from './client'
import { createPendingNotifications, fetchNotificationStates } from './notifications'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlertSeverity = 'low' | 'medium' | 'high'
export type AlertType     = 'spending_spike' | 'bills_due' | 'low_balance' | 'new_subscription' | 'price_increase'

export interface Alert {
  alert_key:     string
  type:          AlertType
  severity:      AlertSeverity
  message:       string
  read:          boolean
  dismissed:     boolean
  // Notification metadata — populated from notification_events
  trigger_event: string          // mirrors type; extensible for sub-events
  triggered_at:  string | null   // ISO timestamp of first detection
  sent:          boolean         // whether a notification was delivered
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { high: 0, medium: 1, low: 2 }

// ─── Key helpers ──────────────────────────────────────────────────────────────

function key(type: AlertType, discriminator?: string): string {
  return discriminator ? `${type}:${discriminator}` : type
}

// ─── 1. Spending spike ────────────────────────────────────────────────────────

async function detectSpendingSpikes(user_id: string): Promise<Omit<Alert, 'read' | 'dismissed' | 'trigger_event' | 'triggered_at' | 'sent'>[]> {
  const rows = await query<{
    category:   string
    this_month: string
    last_month: string
  }>(
    `SELECT
       category,
       SUM(CASE WHEN transaction_date >= date_trunc('month', CURRENT_DATE)
                THEN amount ELSE 0 END)                                    AS this_month,
       SUM(CASE WHEN transaction_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
                 AND transaction_date <  date_trunc('month', CURRENT_DATE)
                THEN amount ELSE 0 END)                                    AS last_month
     FROM transactions
     WHERE user_id = $1
       AND amount > 0
       AND category IS NOT NULL
       AND category NOT IN ('income', 'transfer')
       AND transaction_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
     GROUP BY category
     HAVING
       SUM(CASE WHEN transaction_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
                 AND transaction_date <  date_trunc('month', CURRENT_DATE)
                THEN amount ELSE 0 END) > 10`,
    [user_id]
  )

  const alerts: Omit<Alert, 'read' | 'dismissed' | 'trigger_event' | 'triggered_at' | 'sent'>[] = []
  for (const row of rows) {
    const thisMonth = Number(row.this_month)
    const lastMonth = Number(row.last_month)
    if (lastMonth === 0) continue

    const pct = ((thisMonth - lastMonth) / lastMonth) * 100
    if (pct < 40) continue

    const severity: AlertSeverity = pct >= 100 ? 'high' : 'medium'
    alerts.push({
      alert_key: key('spending_spike', row.category),
      type: 'spending_spike',
      severity,
      message: `Your ${row.category} spending is up ${Math.round(pct)}% from last month ($${Math.round(lastMonth)} → $${Math.round(thisMonth)}).`,
    })
  }
  return alerts
}

// ─── 2. Bills due soon ────────────────────────────────────────────────────────

async function detectBillsDueSoon(user_id: string): Promise<Omit<Alert, 'read' | 'dismissed' | 'trigger_event' | 'triggered_at' | 'sent'>[]> {
  const rows = await query<{
    normalized_merchant: string
    avg_amount:          string
    last_date:           string
    freq_days:           string | null
  }>(
    `SELECT
       normalized_merchant,
       ROUND(AVG(amount)::numeric, 2) AS avg_amount,
       MAX(transaction_date)::text    AS last_date,
       ROUND(
         (MAX(transaction_date) - MIN(transaction_date))::numeric
         / NULLIF(COUNT(*) - 1, 0)
       )                              AS freq_days
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

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dueSoon: string[] = []

  for (const row of rows) {
    if (!row.freq_days) continue
    const freqDays      = Number(row.freq_days)
    const lastDate      = new Date(row.last_date)
    lastDate.setHours(0, 0, 0, 0)
    const daysSinceLast = Math.floor((today.getTime() - lastDate.getTime()) / 86_400_000)
    const cyclesPassed  = Math.floor(daysSinceLast / freqDays)
    const nextDate      = new Date(lastDate)
    nextDate.setDate(nextDate.getDate() + (cyclesPassed + 1) * freqDays)
    const daysUntil     = Math.round((nextDate.getTime() - today.getTime()) / 86_400_000)
    if (daysUntil >= 0 && daysUntil <= 7) dueSoon.push(row.normalized_merchant)
  }

  if (dueSoon.length === 0) return []

  const count    = dueSoon.length
  const severity: AlertSeverity = count >= 5 ? 'high' : count >= 3 ? 'medium' : 'low'
  const names    = dueSoon.slice(0, 3).join(', ') + (count > 3 ? ` +${count - 3} more` : '')
  return [{
    alert_key: key('bills_due'),
    type: 'bills_due',
    severity,
    message: `${count} bill${count > 1 ? 's' : ''} due in the next 7 days: ${names}.`,
  }]
}

// ─── 3. Low projected balance ─────────────────────────────────────────────────

async function detectLowBalance(user_id: string): Promise<Omit<Alert, 'read' | 'dismissed' | 'trigger_event' | 'triggered_at' | 'sent'>[]> {
  const row = await queryOne<{
    avg_income: string | null
    avg_spend:  string | null
  }>(
    `SELECT
       ROUND(AVG(monthly_inflow)::numeric,  2) AS avg_income,
       ROUND(AVG(monthly_outflow)::numeric, 2) AS avg_spend
     FROM (
       SELECT
         TO_CHAR(transaction_date, 'YYYY-MM') AS month,
         SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) AS monthly_inflow,
         SUM(CASE WHEN amount > 0 THEN amount        ELSE 0 END) AS monthly_outflow
       FROM transactions
       WHERE user_id = $1
         AND transaction_date IS NOT NULL
         AND transaction_date >= CURRENT_DATE - INTERVAL '90 days'
       GROUP BY month
     ) monthly`,
    [user_id]
  )

  const income = Number(row?.avg_income ?? 0)
  const spend  = Number(row?.avg_spend  ?? 0)
  if (income === 0) return []

  const net    = income - spend
  const deficit = -net

  if (net >= 0) return []

  const severity: AlertSeverity = deficit / income >= 0.2 ? 'high' : 'medium'
  return [{
    alert_key: key('low_balance'),
    type: 'low_balance',
    severity,
    message: `You're spending $${Math.round(deficit)} more than you earn on average per month.`,
  }]
}

// ─── 4. New subscription ──────────────────────────────────────────────────────

async function detectNewSubscriptions(user_id: string): Promise<Omit<Alert, 'read' | 'dismissed' | 'trigger_event' | 'triggered_at' | 'sent'>[]> {
  const rows = await query<{ normalized_merchant: string }>(
    `SELECT normalized_merchant
     FROM transactions
     WHERE user_id = $1
       AND category = 'subscriptions'
       AND normalized_merchant IS NOT NULL
     GROUP BY normalized_merchant
     HAVING MIN(transaction_date) >= CURRENT_DATE - INTERVAL '35 days'`,
    [user_id]
  )

  return rows.map(r => ({
    alert_key: key('new_subscription', r.normalized_merchant),
    type:      'new_subscription' as AlertType,
    severity:  'low'             as AlertSeverity,
    message:   `New subscription detected: ${r.normalized_merchant}.`,
  }))
}

// ─── 5. Price increase ────────────────────────────────────────────────────────

async function detectPriceIncreases(user_id: string): Promise<Omit<Alert, 'read' | 'dismissed' | 'trigger_event' | 'triggered_at' | 'sent'>[]> {
  const rows = await query<{
    normalized_merchant: string
    historical_avg:      string
    latest_amount:       string
  }>(
    `WITH merchant_history AS (
       SELECT
         normalized_merchant,
         ROUND(AVG(amount)::numeric, 2)                           AS historical_avg,
         (ARRAY_AGG(amount ORDER BY transaction_date DESC))[1]   AS latest_amount,
         COUNT(*)                                                 AS tx_count
       FROM transactions
       WHERE user_id = $1
         AND amount > 0
         AND normalized_merchant IS NOT NULL
         AND transaction_date IS NOT NULL
       GROUP BY normalized_merchant
       HAVING COUNT(*) >= 3
     )
     SELECT normalized_merchant, historical_avg, latest_amount
     FROM merchant_history
     WHERE latest_amount > historical_avg * 1.2`,
    [user_id]
  )

  const alerts: Omit<Alert, 'read' | 'dismissed' | 'trigger_event' | 'triggered_at' | 'sent'>[] = []
  for (const row of rows) {
    const avg    = Number(row.historical_avg)
    const latest = Number(row.latest_amount)
    const pct    = ((latest - avg) / avg) * 100
    const severity: AlertSeverity = pct >= 50 ? 'high' : 'medium'
    alerts.push({
      alert_key: key('price_increase', row.normalized_merchant),
      type: 'price_increase',
      severity,
      message: `${row.normalized_merchant} charged $${latest.toFixed(2)} — ${Math.round(pct)}% above your usual $${avg.toFixed(2)}.`,
    })
  }
  return alerts
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function getAlerts(user_id: string): Promise<Alert[]> {
  const [spikes, bills, balance, newSubs, prices] = await Promise.all([
    detectSpendingSpikes(user_id),
    detectBillsDueSoon(user_id),
    detectLowBalance(user_id),
    detectNewSubscriptions(user_id),
    detectPriceIncreases(user_id),
  ])

  const raw = [...spikes, ...bills, ...balance, ...newSubs, ...prices]
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])

  if (raw.length === 0) return []

  const alert_keys = raw.map(a => a.alert_key)

  // Persist notification events for newly-detected alerts, then fetch all
  // three data sources in parallel (states, notification metadata)
  await createPendingNotifications(user_id, raw.map(a => ({
    alert_key: a.alert_key,
    type:      a.type,
    message:   a.message,
    severity:  a.severity,
  })))

  const [stateRows, notifMap] = await Promise.all([
    query<{ alert_key: string; read: boolean; dismissed: boolean }>(
      `SELECT alert_key, read, dismissed
       FROM user_alert_states
       WHERE user_id = $1 AND alert_key = ANY($2)`,
      [user_id, alert_keys]
    ),
    fetchNotificationStates(user_id, alert_keys),
  ])

  const stateMap = new Map(stateRows.map(r => [r.alert_key, r]))

  return raw.map(a => {
    const s = stateMap.get(a.alert_key)
    const n = notifMap.get(a.alert_key)
    return {
      ...a,
      read:          s?.read          ?? false,
      dismissed:     s?.dismissed     ?? false,
      trigger_event: a.type,
      triggered_at:  n?.triggered_at  ?? null,
      sent:          n?.sent          ?? false,
    }
  })
}

// ─── State mutations ──────────────────────────────────────────────────────────

export async function markAlertRead(user_id: string, alert_key: string): Promise<void> {
  await query(
    `INSERT INTO user_alert_states (user_id, alert_key, read, dismissed, updated_at)
     VALUES ($1, $2, true, false, now())
     ON CONFLICT (user_id, alert_key) DO UPDATE
       SET read = true, updated_at = now()`,
    [user_id, alert_key]
  )
}

export async function dismissAlert(user_id: string, alert_key: string): Promise<void> {
  await query(
    `INSERT INTO user_alert_states (user_id, alert_key, read, dismissed, updated_at)
     VALUES ($1, $2, true, true, now())
     ON CONFLICT (user_id, alert_key) DO UPDATE
       SET read = true, dismissed = true, updated_at = now()`,
    [user_id, alert_key]
  )
}
