import webpush from 'web-push'

let configured = false

function ensureConfigured() {
  if (configured) return

  const publicKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY

  if (!publicKey || !privateKey) {
    throw new Error('NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set in environment variables.')
  }

  webpush.setVapidDetails(
    process.env.VAPID_CONTACT ?? 'mailto:alerts@stratifi.app',
    publicKey,
    privateKey
  )

  configured = true
}

/** Lazily configured webpush client — env vars are read at first use, not at import time. */
export function getWebpush() {
  ensureConfigured()
  return webpush
}
