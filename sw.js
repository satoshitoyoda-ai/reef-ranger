// Offline cache. Bump VERSION on every release (and VERSION in js/game.js) so devices pick up the new files.
const VERSION = 'reef-ranger-v1.0.1';
const FILES = ['./', './index.html', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png',
  './js/game.js', './js/save.js', './js/ocean.js', './js/critters.js', './js/shade.js', './js/data.js', './js/audio.js', './js/u.js',
  './lib/three.module.js', './lib/three.core.js', './lib/addons/utils/BufferGeometryUtils.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  // Delete only this game's old caches. Other games on the same site (same origin) keep theirs.
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k.startsWith('reef-ranger-')).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok && new URL(e.request.url).origin === location.origin) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  })));
});
