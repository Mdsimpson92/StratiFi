/**
 * CSV Parser
 *
 * Detects column layout from common bank/card export formats and extracts
 * raw rows. Does NOT parse dates or amounts — that happens in normalizer.ts.
 *
 * Supported formats (auto-detected from headers):
 *   Chase         — Date, Description, Amount (negative = debit)
 *   Bank of America — Date, Description, Amount, Running Bal., Category
 *   Capital One   — Transaction Date, Posted Date, Card No., Description, Category, Debit, Credit
 *   Mint          — Date, Description, Original Description, Amount, Transaction Type, Category, Account Name
 *   Wells Fargo   — Date, Amount, *, *, Description
 *   Generic       — any CSV with date + description + amount columns
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RawRow {
  date_raw:        string
  description_raw: string
  amount_raw:      string           // populated when single amount column
  debit_raw?:      string           // populated when split debit/credit
  credit_raw?:     string
  account_raw?:    string
  category_raw?:   string           // bank-provided category (informational only)
  /** When true, a positive amount_raw means debit (withdrawal). Default: false = Chase convention (negative = debit). */
  positive_is_debit?: boolean
}

export interface ParseResult {
  rows:           RawRow[]
  detectedFormat: string
  warnings:       string[]
}

// ─── Column name candidates ───────────────────────────────────────────────────

const DATE_HEADERS = [
  'date', 'transaction date', 'trans date', 'trans. date',
  'posted date', 'posting date', 'settlement date',
]
const DESC_HEADERS = [
  'description', 'merchant', 'payee', 'name', 'details',
  'memo', 'original description', 'transaction description',
  'narrative', 'reference',
]
const AMOUNT_HEADERS = [
  'amount', 'transaction amount', 'amount (usd)', 'amt',
]
const DEBIT_HEADERS  = [
  'debit', 'debit amount', 'debit amt', 'description debit',
  'withdrawal', 'withdrawals', 'withdrawal amount',
  'payment', 'payments', 'charge', 'charges',
  'money out',
]
const CREDIT_HEADERS = [
  'credit', 'credit amount', 'credit amt', 'description credit',
  'deposit', 'deposits', 'deposit amount',
  'money in',
]
const ACCOUNT_HEADERS = ['account', 'account name', 'account label', 'account number']
const CATEGORY_HEADERS = ['category', 'transaction type', 'type']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/['"]/g, '').replace(/\s+/g, ' ')
}

function findCol(headers: string[], candidates: string[]): number {
  const norm = headers.map(normalize)
  for (const candidate of candidates) {
    const idx = norm.indexOf(candidate)
    if (idx !== -1) return idx
  }
  return -1
}

/** Minimal CSV line parser — handles double-quoted fields with embedded commas. */
export function parseLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      // Escaped quote inside quoted field: ""
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseCSV(text: string): ParseResult {
  const warnings: string[] = []

  // Normalize line endings
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)

  if (lines.length < 2) {
    throw new Error('File must have at least a header row and one data row.')
  }

  // Find header row — skip leading comment/metadata lines some banks include
  let headerIdx = 0
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const cols = parseLine(lines[i])
    if (findCol(cols, DATE_HEADERS) !== -1 || findCol(cols, DESC_HEADERS) !== -1) {
      headerIdx = i
      break
    }
  }

  const headers = parseLine(lines[headerIdx])

  const dateIdx     = findCol(headers, DATE_HEADERS)
  const descIdx     = findCol(headers, DESC_HEADERS)
  const amountIdx   = findCol(headers, AMOUNT_HEADERS)
  const debitIdx    = findCol(headers, DEBIT_HEADERS)
  const creditIdx   = findCol(headers, CREDIT_HEADERS)
  const accountIdx  = findCol(headers, ACCOUNT_HEADERS)
  const categoryIdx = findCol(headers, CATEGORY_HEADERS)

  // Validate required columns
  if (dateIdx === -1) {
    throw new Error(
      'No date column found. Expected a header named "Date", "Transaction Date", or similar.'
    )
  }
  if (descIdx === -1) {
    throw new Error(
      'No description column found. Expected "Description", "Merchant", "Payee", or similar.'
    )
  }
  if (amountIdx === -1 && debitIdx === -1 && creditIdx === -1) {
    throw new Error(
      'No amount column found. Expected "Amount", "Debit"/"Credit", or "Withdrawal"/"Deposit" columns.'
    )
  }

  const hasSplitAmounts = debitIdx !== -1 || creditIdx !== -1
  const detectedFormat  = hasSplitAmounts ? 'split-debit-credit' : 'single-amount'

  // If the single amount column is named like a withdrawal/charge column,
  // positive values are debits (opposite of Chase convention).
  const amountColName = amountIdx !== -1 ? normalize(headers[amountIdx]) : ''
  const positiveIsDebit = ['withdrawal', 'withdrawals', 'payment', 'charge', 'charges', 'money out']
    .some(n => amountColName.includes(n))

  const rows: RawRow[] = []

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = parseLine(lines[i])

    const dateVal  = (dateIdx  !== -1 ? cols[dateIdx]  : '') ?? ''
    const descVal  = (descIdx  !== -1 ? cols[descIdx]  : '') ?? ''

    // Skip clearly empty rows
    if (!dateVal.trim() && !descVal.trim()) continue

    rows.push({
      date_raw:         dateVal,
      description_raw:  descVal,
      amount_raw:       amountIdx !== -1 ? (cols[amountIdx] ?? '') : '',
      debit_raw:        debitIdx  !== -1 ? (cols[debitIdx]  ?? '') : undefined,
      credit_raw:       creditIdx !== -1 ? (cols[creditIdx] ?? '') : undefined,
      account_raw:      accountIdx  !== -1 ? (cols[accountIdx]  ?? '') : undefined,
      category_raw:     categoryIdx !== -1 ? (cols[categoryIdx] ?? '') : undefined,
      positive_is_debit: !hasSplitAmounts && positiveIsDebit ? true : undefined,
    })
  }

  if (rows.length === 0) {
    throw new Error('No data rows found after the header.')
  }

  if (headerIdx > 0) {
    warnings.push(`Skipped ${headerIdx} metadata line(s) before the header row.`)
  }

  return { rows, detectedFormat, warnings }
}
