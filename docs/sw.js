// Lets the app open without internet (the cafe database is on the device anyway).
const CACHE = 'cafe-loyalty-v3';
const FILES = ['./', 'index.html', 'app.js', 'store.js', 'styles.css', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'vendor/qrcode.js', 'vendor/jsQR.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Tapping a notification opens (or focuses) the loyalty card.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = self.registration.scope + (e.notification.data?.url || '#/card');
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = wins.find((c) => c.url.startsWith(self.registration.scope));
    if (w) { await w.focus(); return w.navigate(target).catch(() => {}); }
    return self.clients.openWindow(target);
  })());
});

// Network first (so updates on GitHub appear), cache as fallback when offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
