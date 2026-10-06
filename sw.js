/* Service worker: precaché versionada y atómica de la app (offline) + caché acotada para la API del tiempo.
   Al publicar una versión nueva, sube APP_VERSION: el navegador detecta el cambio, descarga todos los
   ficheros de golpe en una caché nueva y avisa al usuario. Así nunca se mezclan módulos de dos versiones. */
const APP_VERSION = '1.2.0';
const STATIC_CACHE = `ov-static-${APP_VERSION}`;
const API_CACHE = 'ov-api-v1';
const API_MAX_AGE_MS = 3 * 60 * 60 * 1000;
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/ui.js',
  './js/icons.js',
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
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    // `cache: 'reload'` evita la caché HTTP del navegador: todos los ficheros llegan frescos y coherentes.
    await Promise.all(STATIC_ASSETS.map(async (url) => {
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (!res.ok) throw new Error(`No se pudo precachear ${url}`);
      await cache.put(url, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== API_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isApiRequest(url) { return url.hostname.endsWith('open-meteo.com'); }
function isSameOrigin(url) { return url.origin === self.location.origin; }

function responseAge(res) {
  const date = res.headers.get('date');
  return date ? Date.now() - new Date(date).getTime() : Infinity;
}

/** API: red primero; sin red, se devuelve la copia guardada solo si tiene menos de 3 horas. */
async function networkFirstBounded(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached && responseAge(cached) < API_MAX_AGE_MS) return cached;
    throw err;
  }
}

/** App: caché versionada primero (coherente), red como respaldo para lo no precacheado. */
async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    return await fetch(request);
  } catch (err) {
    if (request.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (isApiRequest(url)) { event.respondWith(networkFirstBounded(request)); return; }
  if (isSameOrigin(url)) event.respondWith(cacheFirst(request));
});
