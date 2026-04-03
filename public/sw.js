// ─── StratiFi Service Worker ──────────────────────────────────────────────────

const CACHE_NAME    = 'stratifi-v1'
const STATIC_ASSETS = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png', '/Stratifi-logo.png']

// ── Install: pre-cache static shell ──────────────────────────────────────────
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// ── Activate: clear old caches ────────────────────────────────────────────────
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ── Fetch: cache-first for static, network-first for API ─────────────────────
self.addEventListener('fetch', function (event) {
  const url = new URL(event.request.url)

  // Skip non-GET and cross-origin requests
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return

  // API routes: network-first, no caching
  if (url.pathname.startsWith('/api/')) return

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
        }
        return response
      })
    })
  )
})

self.addEventListener('push', function (event) {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { message: event.data ? event.data.text() : '' }
  }

  const title   = data.title   || 'StratiFi Alert'
  const options = {
    body:  data.message  || '',
    icon:  '/Stratifi-logo.png',
    badge: '/Stratifi-logo.png',
    tag:   data.alert_key || 'stratifi-alert',
    data:  { url: '/' },
    requireInteraction: data.severity === 'high',
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        for (const client of clientList) {
          if ('focus' in client) return client.focus()
        }
        if (clients.openWindow) return clients.openWindow('/')
      })
  )
})
