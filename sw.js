// Japanese Formula — Service Worker (offline-first cache)
const CACHE = 'jfrace-v1-2026-04-29-01';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/courses.js',
  './js/race.js',
  './js/storage.js',
  './js/app.js',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // navigation: try network, fallback to cached index
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }
  // cache-first for assets
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      // 同一オリジンのみキャッシュに追加
      if (res && res.status === 200 && new URL(req.url).origin === self.location.origin) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(req, clone));
      }
      return res;
    }).catch(() => hit))
  );
});
