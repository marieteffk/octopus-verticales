/* Service worker: precaché de la app (offline) + caché de red para la API del tiempo. */
const STATIC_CACHE = 'ov-static-v1';
const API_CACHE = 'ov-api-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/ui.js',
  './js/db.js',
  './js/cloud.js',
  './js/media.js',
  './js/weather.js',
  './js/views/home.js',
  './js/views/jobs.js',
  './js/views/photos.js',
  './js/views/notes.js',
  './js/views/weather.js',
  './js/views/feed.js',
  './js/views/calendar.js',
  './js/views/clients.js',
  './js/views/inventory.js',
  './js/views/timesheets.js',
  './js/views/safety.js',
  './js/views/team.js',
  './js/views/settings.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== STATIC_CACHE && k !== API_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.hostname.endsWith('open-meteo.com');
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (isApiRequest(url)) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }
  if (isSameOrigin(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
