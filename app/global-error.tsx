"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body>
        <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'system-ui' }}>
          <h2 style={{ color: '#1e3166' }}>Something went wrong</h2>
          <p style={{ color: '#6b7280' }}>We've been notified and are looking into it.</p>
          <button
            onClick={reset}
            style={{ marginTop: '1rem', padding: '0.5rem 1.5rem', background: '#2ab9b0', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
