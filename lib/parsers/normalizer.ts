/**
 * Normalizer
 *
 * Converts RawRow[] → NormalizedTransaction[].
 * Handles date parsing, amount parsing, merchant normalization, direction.
 *
 * This is the boundary between format-specific parsing and the shared pipeline.
 * Future bank integrations (Plaid, etc.) produce NormalizedTransaction directly.
 */

import type { RawRow } from './csv-parser'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NormalizedTransaction {
  date:        string   // ISO 8601: YYYY-MM-DD
  description: string   // original description, trimmed
  merchant:    string   // normalized merchant name
  amount:      number   // always positive
  direction:   'debit' | 'credit'
  account_raw?: string
  category_raw?: string
  raw:         RawRow   // preserved for raw_data column
}

export interface NormalizeResult {
  transactions: NormalizedTransaction[]
  warnings:     string[]
  skipped:      number
}

// ─── Date parsing ─────────────────────────────────────────────────────────────

const DATE_PATTERNS: Array<{
  re: RegExp
  parse: (m: RegExpMatchArray) => string
}> = [
  // YYYY-MM-DD
  {
    re: /^(\d{4})-(\d{2})-(\d{2})$/,
    parse: m => `${m[1]}-${m[2]}-${m[3]}`,
  },
  // MM/DD/YYYY  or  M/D/YYYY
  {
    re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    parse: m => `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`,
  },
  // MM-DD-YYYY
  {
    re: /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
    parse: m => `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`,
  },
  // MM/DD/YY
  {
    re: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/,
    parse: m => {
      const yr = parseInt(m[3], 10)
      const full = yr >= 50 ? 1900 + yr : 2000 + yr
      return `${full}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
    },
  },
  // Jan 15, 2024  or  January 15, 2024
  {
    re: /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/,
    parse: m => {
      const month = parseMonthName(m[1])
      if (!month) return ''
      return `${m[3]}-${month.toString().padStart(2, '0')}-${m[2].padStart(2, '0')}`
    },
  },
  // 28-Apr-17  or  28-Apr-2017  (DD-Mon-YY / DD-Mon-YYYY)
  {
    re: /^(\d{1,2})[\/\-]([A-Za-z]{3,9})[\/\-](\d{2}|\d{4})$/,
    parse: m => {
      const month = parseMonthName(m[2])
      if (!month) return ''
      const yr = parseInt(m[3], 10)
      const full = m[3].length === 2 ? (yr >= 50 ? 1900 + yr : 2000 + yr) : yr
      return `${full}-${month.toString().padStart(2, '0')}-${m[1].padStart(2, '0')}`
    },
  },
  // Apr 28, 17  or  Apr 28 2017  (Mon DD YY/YYYY — less common but seen in exports)
  {
    re: /^([A-Za-z]{3,9})\s+(\d{1,2})[,\s]+(\d{2}|\d{4})$/,
    parse: m => {
      const month = parseMonthName(m[1])
      if (!month) return ''
      const yr = parseInt(m[3], 10)
      const full = m[3].length === 2 ? (yr >= 50 ? 1900 + yr : 2000 + yr) : yr
      return `${full}-${month.toString().padStart(2, '0')}-${m[2].padStart(2, '0')}`
    },
  },
]

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

function parseMonthName(s: string): number | null {
  return MONTH_NAMES[s.toLowerCase()] ?? null
}

export function parseDate(raw: string): string | null {
  const s = raw.trim()
  for (const { re, parse } of DATE_PATTERNS) {
    const m = s.match(re)
    if (m) {
      const result = parse(m)
      if (result) return result
    }
  }
  return null
}

// ─── Amount parsing ───────────────────────────────────────────────────────────

/**
 * Parse a raw amount string to a signed float.
 * Handles: $1,234.56  -$1,234.56  (1,234.56)  1234.56  1,234
 * Returns NaN if unparseable.
 */
export function parseAmount(raw: string): number {
  const s = raw.trim()
  if (!s) return NaN

  // Parentheses → negative: (1,234.56) = -1234.56
  const parenMatch = s.match(/^\(([^)]+)\)$/)
  if (parenMatch) {
    return -parseAmount(parenMatch[1])
  }

  // Strip currency symbols, commas, spaces
  const cleaned = s.replace(/[$£€¥,\s]/g, '')
  return parseFloat(cleaned)
}

// ─── Merchant normalization ───────────────────────────────────────────────────

// Common noise tokens to strip before taking the significant words
const NOISE_TOKENS = new Set([
  'llc', 'inc', 'corp', 'ltd', 'co', 'company',
  'the', 'a', 'an', 'of', 'and', '&',
  // Transaction-specific noise
  'pos', 'purchase', 'payment', 'autopay', 'online', 'web',
  'debit', 'credit', 'card', 'transfer', 'recurring',
  '#', '*',
])

// Location suffixes often appended after merchant name
const LOCATION_RE = /\s+(#\d+|\d{5}(-\d{4})?|[A-Z]{2}\s+\d+|\d+\s+[A-Z]{2})\s*$/

export function normalizeMerchant(description: string): string {
  let s = description.trim()

  // Strip trailing location info (store #, zip code, state+number)
  s = s.replace(LOCATION_RE, '')

  // Remove anything after common separators (transaction IDs, dates appended by bank)
  s = s.replace(/\s+(ref|id|txn|seq|ach)\s*[#:]?\s*\w+.*/i, '')
  s = s.replace(/\s+\d{4,}.*$/, '')   // trailing long numbers

  // Normalize whitespace, keep original casing for now
  s = s.replace(/\s+/g, ' ').trim()

  // Split into words, filter noise, take first 4 significant words
  const words = s.split(/\s+/)
  const significant = words.filter(w => !NOISE_TOKENS.has(w.toLowerCase().replace(/[^a-z]/g, '')))
  const kept = significant.slice(0, 4).join(' ')

  // Title-case
  return (kept || s)
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

// ─── Main normalizer ──────────────────────────────────────────────────────────

export function normalizeRows(rows: RawRow[]): NormalizeResult {
  const transactions: NormalizedTransaction[] = []
  const warnings: string[] = []
  let skipped = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowLabel = `Row ${i + 2}` // +2 because row 1 is header

    // ── Date ──
    const date = parseDate(row.date_raw)
    if (!date) {
      warnings.push(`${rowLabel}: Could not parse date "${row.date_raw}" — skipped.`)
      skipped++
      continue
    }

    // ── Amount + Direction ──
    let amount: number
    let direction: 'debit' | 'credit'

    if (row.debit_raw !== undefined || row.credit_raw !== undefined) {
      // Split debit/credit columns (Capital One format)
      const debitVal  = row.debit_raw  ? parseAmount(row.debit_raw)  : NaN
      const creditVal = row.credit_raw ? parseAmount(row.credit_raw) : NaN

      const hasDebit  = !isNaN(debitVal)  && debitVal  !== 0
      const hasCredit = !isNaN(creditVal) && creditVal !== 0

      if (hasDebit && !hasCredit) {
        amount    = Math.abs(debitVal)
        direction = 'debit'
      } else if (hasCredit && !hasDebit) {
        amount    = Math.abs(creditVal)
        direction = 'credit'
      } else if (hasDebit && hasCredit) {
        // Unusual: both populated — net them, treat as debit
        warnings.push(`${rowLabel}: Both debit and credit populated — using debit column.`)
        amount    = Math.abs(debitVal)
        direction = 'debit'
      } else {
        warnings.push(`${rowLabel}: No amount found in debit/credit columns — skipped.`)
        skipped++
        continue
      }
    } else {
      // Single amount column
      const raw = parseAmount(row.amount_raw)
      if (isNaN(raw)) {
        warnings.push(`${rowLabel}: Could not parse amount "${row.amount_raw}" — skipped.`)
        skipped++
        continue
      }
      amount = Math.abs(raw)
      if (row.positive_is_debit) {
        // Column is named like "Withdrawal" — positive = debit
        direction = raw > 0 ? 'debit' : 'credit'
      } else {
        // Default (Chase/standard): negative = debit, positive = credit
        direction = raw < 0 ? 'debit' : 'credit'
      }
    }

    if (amount === 0) {
      // Skip zero-amount rows (common in some bank exports)
      skipped++
      continue
    }

    transactions.push({
      date,
      description: row.description_raw.trim(),
      merchant:    normalizeMerchant(row.description_raw),
      amount,
      direction,
      account_raw:  row.account_raw,
      category_raw: row.category_raw,
      raw:          row,
    })
  }

  return { transactions, warnings, skipped }
}
