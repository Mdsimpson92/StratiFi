import Link from 'next/link'
import type { FileSummary } from '@/lib/actions/transactions'

const STATUS_STYLES: Record<string, string> = {
  complete:   'bg-green-100 text-green-700',
  processing: 'bg-amber-100 text-amber-700',
  error:      'bg-red-100 text-red-600',
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function FileList({ files }: { files: FileSummary[] }) {
  if (files.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">
        No files uploaded yet.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-gray-100">
      {files.map(f => (
        <li key={f.id}>
          <Link
            href={`/transactions/${f.id}`}
            className="flex items-center justify-between py-4 px-1 hover:bg-gray-50 rounded-lg transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate group-hover:text-indigo-600">
                {f.filename}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {f.row_count} transactions
                {f.date_range_start && f.date_range_end
                  ? ` · ${formatDate(f.date_range_start)} – ${formatDate(f.date_range_end)}`
                  : ''}
              </p>
              {f.error_message && (
                <p className="text-xs text-red-500 mt-0.5">{f.error_message}</p>
              )}
            </div>
            <span className={[
              'ml-4 shrink-0 text-xs font-medium px-2 py-0.5 rounded-full',
              STATUS_STYLES[f.status] ?? 'bg-gray-100 text-gray-600',
            ].join(' ')}>
              {f.status}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
