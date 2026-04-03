'use client'

import { useState, useRef, useEffect } from 'react'
import { uploadTransactions } from '@/lib/actions/transactions'
import { useRouter } from 'next/navigation'

export default function UploadForm() {
  const [dragging, setDragging]   = useState(false)
  const [file, setFile]           = useState<File | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [warnings, setWarnings]   = useState<string[]>([])
  const [mounted, setMounted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router   = useRouter()

  useEffect(() => { setMounted(true) }, [])

  function handleFile(f: File) {
    setError(null)
    setWarnings([])
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setError('Only CSV files are supported.')
      return
    }
    setFile(f)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return

    setLoading(true)
    setError(null)
    setWarnings([])

    const formData = new FormData()
    formData.append('file', file)

    const result = await uploadTransactions(formData)
    setLoading(false)

    if (!result.success) {
      setError(result.error ?? 'Upload failed.')
      return
    }

    if (result.warnings && result.warnings.length > 0) {
      setWarnings(result.warnings)
    }

    router.push(`/transactions/${result.fileId}`)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={[
          'relative flex flex-col items-center justify-center gap-2',
          'border-2 border-dashed rounded-xl p-10 cursor-pointer',
          'transition-colors',
          dragging
            ? 'border-indigo-400 bg-indigo-50'
            : file
              ? 'border-green-400 bg-green-50'
              : 'border-gray-200 bg-gray-50 hover:border-gray-300',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="sr-only"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />

        {file ? (
          <>
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
            <p className="text-sm font-medium text-green-700">{file.name}</p>
            <p className="text-xs text-green-600">{(file.size / 1024).toFixed(1)} KB — click to change</p>
          </>
        ) : (
          <>
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm font-medium text-gray-700">
              Drop a CSV file here, or <span className="text-indigo-600">browse</span>
            </p>
            <p className="text-xs text-gray-400">
              Chase, Bank of America, Capital One, Mint, Wells Fargo
            </p>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-1">
          {warnings.slice(0, 5).map((w, i) => <p key={i}>{w}</p>)}
          {warnings.length > 5 && <p>…and {warnings.length - 5} more</p>}
        </div>
      )}

      <button
        type="submit"
        disabled={!file || loading}
        className={`w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
          mounted && (!file || loading)
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-gray-900 text-white hover:bg-gray-700'
        }`}
      >
        {loading ? 'Processing…' : 'Upload & Analyze'}
      </button>
    </form>
  )
}
