'use server'

import { auth }                    from '@clerk/nextjs/server'
import { query, queryOne }         from '@/lib/db/client'
import { parseCSV }                from '@/lib/parsers/csv-parser'
import { normalizeRows }           from '@/lib/parsers/normalizer'
import { categorize, type UserCorrections } from '@/lib/classifiers/categorizer'
import { normalizeMerchantName }   from '@/lib/classifiers/merchant-normalizer'
import { detectRecurring }         from '@/lib/classifiers/recurring-detector'
import { revalidatePath }          from 'next/cache'
import { toDescriptionKey }        from '@/lib/utils/description-key'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UploadResult {
  success:       boolean
  fileId?:       string
  rowCount?:     number
  skipped?:      number
  warnings?:     string[]
  error?:        string
}

export interface TransactionRow {
  id:                   string
  date:                 string
  description:          string
  merchant:             string
  amount:               number
  direction:            'debit' | 'credit'
  category:             string
  is_recurring:         boolean
  recurring_confidence: string | null
  is_transfer:          boolean
  is_ignored:           boolean
  account_label:        string | null
}

export interface FileSummary {
  id:               string
  filename:         string
  row_count:        number
  date_range_start: string | null
  date_range_end:   string | null
  status:           string
  error_message:    string | null
  created_at:       string
}

// ─── Upload & Process ─────────────────────────────────────────────────────────

export async function uploadTransactions(formData: FormData): Promise<UploadResult> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'Not authenticated.' }

  const file = formData.get('file') as File | null
  if (!file) return { success: false, error: 'No file provided.' }

  if (!file.name.toLowerCase().endsWith('.csv')) {
    return { success: false, error: 'Only CSV files are supported.' }
  }

  const text = await file.text()

  // ── Parse ──
  let parseResult
  try {
    parseResult = parseCSV(text)
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }

  // ── Normalize ──
  const { transactions: normalized, warnings, skipped } = normalizeRows(parseResult.rows)

  if (normalized.length === 0) {
    const hint = warnings.length > 0
      ? `\n\nFirst issue: ${warnings[0]}`
      : ` Detected format: ${parseResult.detectedFormat}. Check that the file has valid dates and amounts.`
    return {
      success: false,
      error: `No valid transactions found after parsing.${hint}`,
      warnings,
    }
  }

  // ── Fetch merchant overrides (before classify so Layer 6 fires) ──
  const descriptionKeys = normalized.map(tx => toDescriptionKey(tx.description))

  interface OverrideRow {
    description_key: string
    merchant_name:   string | null
    category:        string | null
    is_recurring:    boolean | null
    is_transfer:     boolean | null
  }

  const overrideRows = await query<OverrideRow>(
    `SELECT description_key, merchant_name, category, is_recurring, is_transfer
     FROM merchant_overrides
     WHERE user_id = $1 AND description_key = ANY($2)`,
    [userId, descriptionKeys]
  )

  const overrideMap = new Map(
    overrideRows.map(o => [o.description_key, o])
  )

  // Build Layer 6 corrections map: descriptionKey → user-chosen category
  const corrections: UserCorrections = {}
  for (const override of overrideRows) {
    if (override.category) {
      corrections[override.description_key] = override.category as UserCorrections[string]
    }
  }

  // ── Classify (corrections passed to enable Layer 6 priority) ──
  const categories     = normalized.map(tx => categorize(tx, corrections))
  const recurringFlags = detectRecurring(normalized)

  // ── Create uploaded_files record ──
  const dates = normalized.map(t => t.date).sort()
  const dateRangeStart = dates[0]
  const dateRangeEnd   = dates[dates.length - 1]

  const fileRecord = await queryOne<{ id: string }>(
    `INSERT INTO uploaded_files (user_id, filename, row_count, date_range_start, date_range_end, status)
     VALUES ($1, $2, $3, $4, $5, 'processing')
     RETURNING id`,
    [userId, file.name, normalized.length, dateRangeStart, dateRangeEnd]
  )

  if (!fileRecord) {
    return { success: false, error: 'Failed to create file record.' }
  }

  // ── Insert transactions ──
  const txCols = [
    'user_id', 'file_id', 'date', 'description', 'merchant', 'amount',
    'direction', 'category', 'is_recurring', 'recurring_confidence',
    'is_transfer', 'account_label', 'raw_data',
    'classification_confidence', 'classification_reason', 'normalized_merchant',
  ]
  const values: unknown[] = []
  const groups: string[]  = []

  for (let i = 0; i < normalized.length; i++) {
    const tx       = normalized[i]
    const key      = toDescriptionKey(tx.description)
    const override = overrideMap.get(key)
    const cat      = categories[i]
    const rec      = recurringFlags[i]

    const hasOverride = !!(override?.category)
    const confidence  = hasOverride ? 1.0 : cat.confidence
    const reason      = hasOverride ? 'user correction' : cat.reason

    const offset = values.length
    groups.push(`(${txCols.map((_, j) => `$${offset + j + 1}`).join(',')})`)
    values.push(
      userId,
      fileRecord.id,
      tx.date,
      tx.description,
      override?.merchant_name ?? tx.merchant,
      tx.amount,
      tx.direction,
      override?.category      ?? cat.category,
      override?.is_recurring  ?? rec.is_recurring,
      rec.recurring_confidence,
      override?.is_transfer   ?? cat.is_transfer,
      tx.account_raw ?? null,
      JSON.stringify(tx.raw),
      confidence,
      reason,
      normalizeMerchantName(tx.description),
    )
  }

  try {
    await query(
      `INSERT INTO transactions (${txCols.join(', ')}) VALUES ${groups.join(', ')}`,
      values
    )
  } catch (err) {
    await query(
      `UPDATE uploaded_files SET status = 'error', error_message = $2 WHERE id = $1`,
      [fileRecord.id, (err as Error).message]
    )
    return { success: false, error: 'Failed to save transactions.' }
  }

  // ── Mark complete ──
  await query(
    `UPDATE uploaded_files SET status = 'complete' WHERE id = $1`,
    [fileRecord.id]
  )

  revalidatePath('/transactions')

  return {
    success:   true,
    fileId:    fileRecord.id,
    rowCount:  normalized.length,
    skipped,
    warnings:  warnings.length > 0 ? warnings : undefined,
  }
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

export async function getUploadedFiles(): Promise<FileSummary[]> {
  const { userId } = await auth()
  if (!userId) return []

  return query<FileSummary>(
    `SELECT id, filename, row_count, date_range_start::text, date_range_end::text, status, error_message, created_at::text
     FROM uploaded_files
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  )
}

export async function getTransactionsForFile(fileId: string): Promise<TransactionRow[]> {
  const { userId } = await auth()
  if (!userId) return []

  return query<TransactionRow>(
    `SELECT id, date::text, description, merchant, amount, direction, category,
            is_recurring, recurring_confidence, is_transfer, is_ignored, account_label
     FROM transactions
     WHERE user_id = $1 AND file_id = $2
     ORDER BY date DESC`,
    [userId, fileId]
  )
}

// ─── Manual corrections ───────────────────────────────────────────────────────

export async function updateTransaction(
  transactionId: string,
  updates: Partial<Pick<TransactionRow, 'merchant' | 'category' | 'is_recurring' | 'is_transfer' | 'is_ignored'>>
): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'Not authenticated.' }

  const sets:   string[]  = []
  const values: unknown[] = []
  let idx = 1

  for (const [key, val] of Object.entries(updates)) {
    sets.push(`${key} = $${idx}`)
    values.push(val)
    idx++
  }

  if (updates.category || updates.merchant) {
    sets.push(`classification_confidence = $${idx}`)
    values.push(1.0)
    idx++
    sets.push(`classification_reason = $${idx}`)
    values.push('user correction')
    idx++
  }

  if (updates.merchant) {
    sets.push(`normalized_merchant = $${idx}`)
    values.push(normalizeMerchantName(updates.merchant))
    idx++
  }

  values.push(transactionId, userId)

  try {
    await query(
      `UPDATE transactions SET ${sets.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1}`,
      values
    )
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }

  revalidatePath('/transactions')
  return { success: true }
}

export async function saveMerchantOverride(
  description: string,
  overrides: {
    merchant_name?: string
    category?:      string
    is_recurring?:  boolean
    is_transfer?:   boolean
  }
): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'Not authenticated.' }

  const key = toDescriptionKey(description)

  const cols   = ['user_id', 'description_key']
  const vals: unknown[] = [userId, key]
  const sets:  string[] = []

  for (const [k, v] of Object.entries(overrides)) {
    cols.push(k)
    vals.push(v)
    sets.push(`${k} = EXCLUDED.${k}`)
  }

  const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ')

  try {
    await query(
      `INSERT INTO merchant_overrides (${cols.join(', ')})
       VALUES (${placeholders})
       ON CONFLICT (user_id, description_key)
       DO UPDATE SET ${sets.join(', ')}`,
      vals
    )
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }

  return { success: true }
}
