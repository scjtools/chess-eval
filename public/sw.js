const CACHE = 'evalcam-v1';
const ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/vendor/stockfish-nnue-16-single.js',
  '/vendor/stockfish-nnue-16-single.wasm',
  '/icon-192.png',
  '/icon-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS).catch(() => null)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => k === CACHE ? null : caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(resp => {
    const copy = resp.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => null);
    return resp;
  })));
});
