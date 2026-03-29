// Beacon Service Worker — offline-capable PWA shell
const CACHE_NAME = 'beacon-v1';

// App shell resources to pre-cache on install
const APP_SHELL = [
  '/',
  '/index.html',
];

// ---- Install: pre-cache app shell ----
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

// ---- Activate: clean old caches ----
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

// ---- Fetch strategy ----
// API calls: network-first with no cache fallback (stale API data is worse than offline)
// Static assets (JS, CSS, images, fonts): cache-first, update in background
// Navigation: network-first, fall back to cached index.html
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // API calls — network only (don't cache HA responses)
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/beacon-data/')) {
    event.respondWith(fetch(request));
    return;
  }

  // Static assets — cache first
  if (/\.(js|css|png|jpg|jpeg|svg|woff2?|ttf|eot|ico)(\?.*)?$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
        return cached || fetchPromise;
      }),
    );
    return;
  }

  // Navigation / HTML — network first, fallback to cached shell
  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match('/index.html')),
  );
});
