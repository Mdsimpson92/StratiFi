import { query } from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Subscription {
  normalized_merchant:      string
  category:                 string
  transaction_count:        number
  average_amount:           number
  last_transaction_date:    string | null
  days_since_last:          number | null
  estimated_frequency_days: number | null
  estimated_monthly_cost:   number
  confidence:               number   // 0–100
}

export interface WasteFlag {
  merchant: string
  reason:   string
}

export interface SubscriptionSummary {
  subscriptions:      Subscription[]
  total_monthly_cost: number
  top_3:              Subscription[]
  waste_flags:        WasteFlag[]
}

// ─── Known subscription merchant names ────────────────────────────────────────
// Checked via substring match against normalized_merchant.

const KNOWN_SUBSCRIPTION_MERCHANTS = [
  'netflix', 'spotify', 'hulu', 'disney', 'apple music', 'apple one',
  'apple tv', 'apple icloud', 'amazon prime', 'youtube premium', 'youtube tv',
  'hbo', 'peacock', 'paramount', 'max', 'crunchyroll', 'tidal', 'pandora',
  'deezer', 'google one', 'icloud', 'dropbox', 'onedrive', 'box',
  'adobe', 'microsoft 365', 'office 365', 'zoom', 'slack', 'notion',
  'figma', 'github', 'noom', 'duolingo', 'headspace', 'calm',
  'peloton', 'classpass', 'audible', 'kindle', 'playstation', 'xbox',
  'nintendo', 'twitch', 'patreon', 'substack',
]

// ─── Known subscription cycles (days) ─────────────────────────────────────────

const SUBSCRIPTION_CYCLES = [7, 14, 30, 60, 90, 180, 365]

// ─── Scoring helpers ──────────────────────────────────────────────────────────

/** Max 35 pts — how close the frequency is to a known subscription cycle. */
function frequencyScore(freqDays: number | null): number {
  if (freqDays === null) return 10  // unknown but passed filters — partial credit

  const minDeviation = Math.min(
    ...SUBSCRIPTION_CYCLES.map(c => Math.abs(freqDays - c) / c)
  )

  if (minDeviation <= 0.05) return 35
  if (minDeviation <= 0.10) return 28
  if (minDeviation <= 0.20) return 20
  if (minDeviation <= 0.35) return 12
  return 5
}

/** Max 30 pts — coefficient of variation (stddev/avg); lower = more consistent. */
function amountConsistencyScore(avg: number, stddev: number | null): number {
  if (stddev === null || avg === 0) return 15  // single transaction, partial credit
  const cv = stddev / avg
  if (cv === 0)    return 30
  if (cv <= 0.01)  return 28
  if (cv <= 0.05)  return 22
  if (cv <= 0.10)  return 15
  if (cv <= 0.20)  return 8
  return 3
}

/** Max 20 pts — substring match against known subscription merchant list. */
function knownMerchantScore(merchant: string): number {
  return KNOWN_SUBSCRIPTION_MERCHANTS.some(k => merchant.includes(k)) ? 20 : 0
}

/** Max 15 pts — category alignment. */
function categoryScore(category: string): number {
  if (category === 'subscriptions') return 15
  if (category === 'entertainment') return 7
  return 0
}

// ─── Duplicate-service groups (for waste detection) ───────────────────────────

const DUPLICATE_GROUPS: Record<string, string[]> = {
  streaming: ['netflix', 'hulu', 'disney', 'apple tv', 'peacock', 'paramount', 'max', 'hbo', 'youtube premium', 'amazon prime video'],
  music:     ['spotify', 'apple music', 'amazon music', 'tidal', 'pandora', 'deezer'],
  cloud:     ['google one', 'icloud', 'dropbox', 'onedrive', 'box'],
}

// ─── Query ────────────────────────────────────────────────────────────────────

export async function getSubscriptions(user_id: string): Promise<SubscriptionSummary> {
  const rows = await query<{
    normalized_merchant:      string
    category:                 string
    transaction_count:        string
    average_amount:           string
    amount_stddev:            string | null
    last_transaction_date:    string | null
    days_since_last:          string | null
    estimated_frequency_days: string | null
    estimated_monthly_cost:   string
  }>(
    `SELECT
       normalized_merchant,
       category,
       COUNT(*)                                         AS transaction_count,
       ROUND(AVG(amount)::numeric, 2)                  AS average_amount,
       ROUND(STDDEV(amount)::numeric, 4)               AS amount_stddev,
       MAX(transaction_date)::text                      AS last_transaction_date,
       (CURRENT_DATE - MAX(transaction_date))           AS days_since_last,

       ROUND(
         (MAX(transaction_date) - MIN(transaction_date))::numeric
         / NULLIF(COUNT(*) - 1, 0),
         1
       )                                                AS estimated_frequency_days,

       ROUND(
         AVG(amount) * COALESCE(
           30.44 / NULLIF(
             (MAX(transaction_date) - MIN(transaction_date))::numeric
             / NULLIF(COUNT(*) - 1, 0),
             0
           ),
           1.0
         )::numeric,
         2
       )                                                AS estimated_monthly_cost

     FROM transactions
     WHERE user_id = $1
       AND amount > 0
       AND normalized_merchant IS NOT NULL
       AND transaction_date IS NOT NULL
     GROUP BY normalized_merchant, category
     HAVING
       category = 'subscriptions'
       OR (
         COUNT(*) >= 2
         AND (MAX(transaction_date) - MIN(transaction_date))::numeric
               / NULLIF(COUNT(*) - 1, 0) BETWEEN 6 AND 45
         AND category NOT IN (
           'food', 'transport', 'shopping', 'gas', 'automotive',
           'transfer', 'bills', 'income', 'investment', 'government',
           'health', 'education', 'alcohol', 'other'
         )
       )`,
    [user_id]
  )

  const subscriptions: Subscription[] = rows.map(r => {
    const avg    = Number(r.average_amount)
    const stddev = r.amount_stddev !== null ? Number(r.amount_stddev) : null
    const freq   = r.estimated_frequency_days !== null ? Number(r.estimated_frequency_days) : null

    const confidence = Math.min(100, Math.round(
      frequencyScore(freq) +
      amountConsistencyScore(avg, stddev) +
      knownMerchantScore(r.normalized_merchant) +
      categoryScore(r.category)
    ))

    return {
      normalized_merchant:      r.normalized_merchant,
      category:                 r.category,
      transaction_count:        Number(r.transaction_count),
      average_amount:           avg,
      last_transaction_date:    r.last_transaction_date,
      days_since_last:          r.days_since_last !== null ? Number(r.days_since_last) : null,
      estimated_frequency_days: freq,
      estimated_monthly_cost:   Number(r.estimated_monthly_cost),
      confidence,
    }
  })

  // Sort: confidence desc, then monthly cost desc
  subscriptions.sort((a, b) =>
    b.confidence - a.confidence || b.estimated_monthly_cost - a.estimated_monthly_cost
  )

  const total_monthly_cost = Math.round(
    subscriptions.reduce((sum, s) => sum + s.estimated_monthly_cost, 0) * 100
  ) / 100

  const top_3 = subscriptions.slice(0, 3)

  // ── Waste detection ──────────────────────────────────────────────────────
  const waste_flags: WasteFlag[] = []

  for (const sub of subscriptions) {
    if (sub.days_since_last !== null && sub.days_since_last > 45) {
      waste_flags.push({
        merchant: sub.normalized_merchant,
        reason:   `No charge in ${sub.days_since_last} days — may be inactive`,
      })
    }
  }

  for (const [group, keywords] of Object.entries(DUPLICATE_GROUPS)) {
    const matches = subscriptions.filter(s =>
      keywords.some(k => s.normalized_merchant.includes(k))
    )
    if (matches.length > 1) {
      for (const s of matches.slice(1)) {
        if (!waste_flags.find(f => f.merchant === s.normalized_merchant)) {
          waste_flags.push({
            merchant: s.normalized_merchant,
            reason:   `Possible duplicate — multiple ${group} services detected`,
          })
        }
      }
    }
  }

  return { subscriptions, total_monthly_cost, top_3, waste_flags }
}
