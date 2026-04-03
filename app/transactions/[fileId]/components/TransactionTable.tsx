'use client'

import { useState, useTransition } from 'react'
import {
  updateTransaction,
  saveMerchantOverride,
} from '@/lib/actions/transactions'
import type { TransactionRow } from '@/lib/actions/transactions'

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'food', 'alcohol', 'gas', 'shopping', 'bills', 'subscriptions',
  'entertainment', 'automotive', 'education', 'government',
  'health', 'investment', 'transfer', 'income', 'other',
]

const CATEGORY_COLORS: Record<string, string> = {
  food:          'bg-orange-100 text-orange-700',
  alcohol:       'bg-rose-100 text-rose-700',
  gas:           'bg-yellow-100 text-yellow-700',
  shopping:      'bg-indigo-100 text-indigo-700',
  bills:         'bg-cyan-100 text-cyan-700',
  subscriptions: 'bg-purple-100 text-purple-700',
  entertainment: 'bg-fuchsia-100 text-fuchsia-700',
  automotive:    'bg-amber-100 text-amber-700',
  education:     'bg-sky-100 text-sky-700',
  government:    'bg-slate-100 text-slate-700',
  health:        'bg-pink-100 text-pink-700',
  investment:    'bg-emerald-100 text-emerald-700',
  transfer:      'bg-gray-100 text-gray-600',
  income:        'bg-green-100 text-green-700',
  other:         'bg-gray-100 text-gray-400',
}

// ─── Row editor (inline) ─────────────────────────────────────────────────────

function TransactionRow({
  tx,
  onUpdate,
}: {
  tx:       TransactionRow
  onUpdate: (id: string, updates: Partial<TransactionRow>) => void
}) {
  const [editing, setEditing]   = useState(false)
  const [merchant, setMerchant] = useState(tx.merchant)
  const [category, setCategory] = useState(tx.category)
  const [isIgnored, setIsIgnored] = useState(tx.is_ignored)
  const [saveOverride, setSaveOverride] = useState(false)
  const [isPending, startTransition]    = useTransition()

  function handleSave() {
    startTransition(async () => {
      const updates = { merchant, category, is_ignored: isIgnored }
      await updateTransaction(tx.id, updates)

      if (saveOverride) {
        await saveMerchantOverride(tx.description, { merchant_name: merchant, category })
      }

      onUpdate(tx.id, { ...updates })
      setEditing(false)
    })
  }

  function handleCancel() {
    setMerchant(tx.merchant)
    setCategory(tx.category)
    setIsIgnored(tx.is_ignored)
    setEditing(false)
  }

  const amountStr = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(tx.amount)

  if (editing) {
    return (
      <tr className="bg-indigo-50">
        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{tx.date}</td>
        <td className="px-4 py-3">
          <p className="text-xs text-gray-400 mb-1 truncate max-w-xs">{tx.description}</p>
          <input
            value={merchant}
            onChange={e => setMerchant(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1 text-gray-900"
          />
        </td>
        <td className="px-4 py-3">
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="text-sm border border-gray-300 rounded px-2 py-1 text-gray-900"
          >
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </td>
        <td className={[
          'px-4 py-3 text-sm font-medium text-right whitespace-nowrap',
          tx.direction === 'credit' ? 'text-green-600' : 'text-gray-900',
        ].join(' ')}>
          {tx.direction === 'credit' ? '+' : ''}{amountStr}
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={saveOverride}
                onChange={e => setSaveOverride(e.target.checked)}
              />
              Remember for future uploads
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={isIgnored}
                onChange={e => setIsIgnored(e.target.checked)}
              />
              Ignore this transaction
            </label>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={isPending}
                className="text-xs px-2.5 py-1 rounded bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50"
              >
                {isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={handleCancel}
                className="text-xs px-2.5 py-1 rounded bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr
      className={[
        'hover:bg-gray-50 cursor-pointer',
        isIgnored ? 'opacity-40' : '',
      ].join(' ')}
      onClick={() => setEditing(true)}
    >
      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{tx.date}</td>
      <td className="px-4 py-3 max-w-xs">
        <p className="text-sm font-medium text-gray-900 truncate">{merchant}</p>
        <p className="text-xs text-gray-400 truncate">{tx.description}</p>
      </td>
      <td className="px-4 py-3">
        <span className={[
          'text-xs font-medium px-2 py-0.5 rounded-full',
          CATEGORY_COLORS[category] ?? 'bg-gray-100 text-gray-500',
        ].join(' ')}>
          {category}
        </span>
        {tx.is_recurring && (
          <span className="ml-1.5 text-xs text-indigo-500 font-medium">↻</span>
        )}
      </td>
      <td className={[
        'px-4 py-3 text-sm font-medium text-right whitespace-nowrap',
        tx.direction === 'credit' ? 'text-green-600' : 'text-gray-900',
      ].join(' ')}>
        {tx.direction === 'credit' ? '+' : ''}{amountStr}
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-gray-400">Edit</span>
      </td>
    </tr>
  )
}

// ─── Main table ───────────────────────────────────────────────────────────────

export default function TransactionTable({
  initialRows,
}: {
  initialRows: TransactionRow[]
}) {
  const [rows, setRows] = useState(initialRows)
  const [filter, setFilter] = useState<string>('all')

  function handleUpdate(id: string, updates: Partial<TransactionRow>) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r))
  }

  const filtered = filter === 'all'
    ? rows
    : rows.filter(r => r.category === filter)

  const uniqueCategories = Array.from(new Set(rows.map(r => r.category))).sort()

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter('all')}
          className={[
            'text-xs px-3 py-1 rounded-full border transition-colors',
            filter === 'all'
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
          ].join(' ')}
        >
          All ({rows.length})
        </button>
        {uniqueCategories.map(cat => {
          const count = rows.filter(r => r.category === cat).length
          return (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={[
                'text-xs px-3 py-1 rounded-full border transition-colors',
                filter === cat
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
              ].join(' ')}
            >
              {cat} ({count})
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Date</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Merchant</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Category</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Amount</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 bg-white">
            {filtered.map(tx => (
              <TransactionRow key={tx.id} tx={tx} onUpdate={handleUpdate} />
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No transactions in this category.</p>
        )}
      </div>

      <p className="text-xs text-gray-400">Click any row to edit merchant name or category.</p>
    </div>
  )
}
