/* Reel service worker.
   Two jobs:
   1. An active service worker with a fetch handler is one of Chrome's
      installability criteria for building a real WebAPK — without this
      file, Chrome falls back to the "create shortcut" bookmark path
      regardless of anything else being correct.
   2. Since it's here anyway, it caches the static app shell (this page,
      the manifest, the icons) so Reel can launch with zero network.
   Reel's actual data — library, playlists, the debug log — all lives in
   IndexedDB, completely separate from this cache. This never touches that.
*/
const CACHE_NAME = 'reel-shell-v1';
const SHELL_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // addAll fails the whole install if even one URL 404s (e.g. this repo
      // doesn't happen to have apple-touch-icon.png at that exact path) —
      // add each one independently so a single missing optional file can't
      // block the shell from being cached at all.
      Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => {})))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: answer instantly from cache if we have it (so the
// app is launchable with no network at all, matching Reel's fully-offline
// design), then quietly refresh the cache from the network in the
// background so the next launch picks up anything new.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // never intercept cross-origin requests

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
