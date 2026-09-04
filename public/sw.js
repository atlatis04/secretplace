// Maplog service worker.
//
// Deliberately conservative: the app's data is live (Supabase, map tiles,
// photos), so nothing is served stale. This exists to make the app
// installable and to keep it opening when the network is flaky, not to work
// offline in full.

const CACHE = 'maplog-shell-v1'
const SHELL = ['/map.html', '/index.html', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE)
      // A missing entry must not fail the whole install.
      .then(cache => Promise.allSettled(SHELL.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const { request } = event

  // Never touch anything that is not a plain same-origin page load.
  if (request.method !== 'GET') return
  if (new URL(request.url).origin !== self.location.origin) return
  if (request.mode !== 'navigate') return

  // Network first, cached shell only when the network fails outright.
  event.respondWith(
    fetch(request)
      .then(response => {
        const copy = response.clone()
        caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {})
        return response
      })
      .catch(() => caches.match(request).then(hit => hit || caches.match('/map.html')))
  )
})
