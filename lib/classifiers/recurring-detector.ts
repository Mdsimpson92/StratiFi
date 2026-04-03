/**
 * Recurring Charge Detector
 *
 * Identifies transactions that appear to be recurring charges
 * (subscriptions, bills, monthly services) by looking for:
 *   1. Known recurring merchants/patterns
 *   2. Multiple same-merchant, same-amount transactions ~30 days apart
 *
 * Returns confidence: 'high' | 'medium' | 'low'
 */

import type { NormalizedTransaction } from '@/lib/parsers/normalizer'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecurringResult {
  is_recurring:         boolean
  recurring_confidence: 'high' | 'medium' | 'low' | null
}

// ─── Known recurring patterns ─────────────────────────────────────────────────

const KNOWN_RECURRING: RegExp[] = [
  // Streaming
  /\bnetflix\b/i,
  /\bhulu\b/i,
  /\bspotify\b/i,
  /\bdisney\+?\b/i,
  /\bhbo (max|now)\b/i,
  /\bamazon prime\b/i,
  /\bparamount\+?\b/i,
  /\bpeacock\b/i,
  /\bapple (music|tv|one|arcade)\b/i,
  /\byoutube premium\b/i,
  /\bgoogle one\b/i,

  // Software & SaaS
  /\badobe\b/i,
  /\bmicrosoft 365\b/i,
  /\bdropbox\b/i,
  /\bnotion\b/i,
  /\bslack\b/i,
  /\bgithub\b/i,
  /\bfigma\b/i,
  /\bcanva\b/i,
  /\bgrammarly\b/i,
  /\b1password\b/i,
  /\blastpass\b/i,

  // Fitness
  /\bplanet fitness\b/i,
  /\bequinox\b/i,
  /\bpeloton\b/i,
  /\bnoom\b/i,

  // Utilities / telecom
  /\bcomcast\b/i,
  /\bxfinity\b/i,
  /\bspectrum\b/i,
  /\bat&t\b/i,
  /\bverizon\b/i,
  /\bt-?mobile\b/i,
  /\bduke energy\b/i,
  /\bpge\b/i,
  /\bcon ed\b/i,

  // Insurance
  /\bgeico\b/i,
  /\bstate farm\b/i,
  /\bprogressive ins/i,
  /\baetna\b/i,
  /\bcigna\b/i,
  /\bblue cross\b/i,
  /\bblue shield\b/i,

  // Storage
  /\bpublic storage\b/i,
  /\bextra space\b/i,
  /\bcubesmart\b/i,

  // Generic recurring signals
  /\bsubscription\b/i,
  /\bautopay\b/i,
  /\bauto-?pay\b/i,
  /\brecurring\b/i,
  /\bmonthly (fee|membership|plan|charge)\b/i,
  /\bannual (fee|membership|plan)\b/i,
  /\brenewal\b/i,
]

// ─── Pattern-based detection ──────────────────────────────────────────────────

function isKnownRecurring(tx: NormalizedTransaction): boolean {
  const text = tx.description + ' ' + tx.merchant
  return KNOWN_RECURRING.some(re => re.test(text))
}

// ─── Frequency-based detection ────────────────────────────────────────────────

/** Returns days between two ISO date strings. */
function daysBetween(a: string, b: string): number {
  const msPerDay = 86_400_000
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / msPerDay
}

/**
 * Groups transactions by merchant key (normalized merchant name, lowercased).
 * Within each group, looks for same-amount transactions approximately
 * 28–35 days apart (monthly billing cycle tolerance).
 */
function detectFrequencyRecurring(
  allTx: NormalizedTransaction[]
): Set<number> {
  const MONTHLY_MIN = 25
  const MONTHLY_MAX = 38
  const AMOUNT_TOLERANCE = 0.01   // allow $0.01 difference (rounding)

  // Group indices by merchant key
  const byMerchant = new Map<string, number[]>()
  for (let i = 0; i < allTx.length; i++) {
    const key = allTx[i].merchant.toLowerCase()
    if (!byMerchant.has(key)) byMerchant.set(key, [])
    byMerchant.get(key)!.push(i)
  }

  const recurring = new Set<number>()

  for (const indices of byMerchant.values()) {
    if (indices.length < 2) continue

    // Sort by date
    const sorted = [...indices].sort((a, b) =>
      allTx[a].date.localeCompare(allTx[b].date)
    )

    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = allTx[sorted[i]]
      const next = allTx[sorted[i + 1]]
      const gap  = daysBetween(curr.date, next.date)
      const amtMatch = Math.abs(curr.amount - next.amount) <= AMOUNT_TOLERANCE

      if (gap >= MONTHLY_MIN && gap <= MONTHLY_MAX && amtMatch) {
        recurring.add(sorted[i])
        recurring.add(sorted[i + 1])
      }
    }
  }

  return recurring
}

// ─── Main detector ────────────────────────────────────────────────────────────

/**
 * Run recurring detection on a batch of transactions.
 * Returns an array of RecurringResult in the same order as input.
 */
export function detectRecurring(
  transactions: NormalizedTransaction[]
): RecurringResult[] {
  const frequencySet = detectFrequencyRecurring(transactions)

  return transactions.map((tx, i) => {
    const knownRecurring = isKnownRecurring(tx)
    const frequencyMatch = frequencySet.has(i)

    if (knownRecurring && frequencyMatch) {
      return { is_recurring: true, recurring_confidence: 'high' }
    }
    if (knownRecurring) {
      return { is_recurring: true, recurring_confidence: 'medium' }
    }
    if (frequencyMatch) {
      return { is_recurring: true, recurring_confidence: 'low' }
    }
    return { is_recurring: false, recurring_confidence: null }
  })
}
