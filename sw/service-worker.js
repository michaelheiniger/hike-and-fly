// Service worker: keeps the app usable offline.
//
// - The app shell (built files) is precached on install and served cache-first.
// - Page navigations try the network first and fall back to the cached shell.
// - Map tiles are served from downloaded areas (caches named hf-area-*) when
//   present, else from the network. Elevation tiles are read by the app itself.
//
// The build fills in the version and the list of files to precache, relative to
// this script (see vite.config.ts).

const VERSION = __VERSION__
const PRECACHE = __PRECACHE__
const SHELL_CACHE = `hf-shell-${VERSION}`
const TILE_HOSTS = ['wmts.geo.admin.ch', 'tile.opentopomap.org', 's3.amazonaws.com']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('hf-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(new URL('index.html', self.registration.scope).href, { cacheName: SHELL_CACHE })))
    return
  }

  if (url.origin === self.location.origin) {
    // Range requests (the elevation archive) always go to the network.
    if (request.headers.has('range')) return
    event.respondWith(caches.match(request, { cacheName: SHELL_CACHE }).then((hit) => hit ?? fetch(request)))
    return
  }

  if (TILE_HOSTS.includes(url.hostname)) {
    // Downloaded areas first, ignoring request details like CORS mode.
    event.respondWith(caches.match(request.url).then((hit) => hit ?? fetch(request)))
  }
})
