/* Reel service worker — minimal app-shell cache.
 *
 * What this does: lets Chrome mint a real installed app (WebAPK)
 * instead of a bookmark shortcut, and lets the app shell itself
 * (index.html + manifest + icons) open with no network connection.
 *
 * What this does NOT do: cache your music. Songs are read live from
 * the folder you grant access to via the File System Access API,
 * which has nothing to do with this file or the network layer at all.
 *
 * Bump CACHE_NAME whenever manifest.json or the icon files change, so
 * returning visitors get the new versions instead of stale cached
 * ones. index.html itself doesn't need a cache bump to update — see
 * the network-first strategy below.
 */
const CACHE_NAME = 'reel-shell-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never intercept anything else

  // Full-page navigations (launching/reloading the app): try the network
  // first so an online user always gets the latest index.html — this
  // project ships updates often, and a stale cached shell would be
  // confusing. Only fall back to the cached copy when genuinely offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match(req)))
    );
    return;
  }

  // Everything else in the shell (manifest, icons): cache-first, since
  // these change rarely — instant load, no network round-trip. Falls
  // back to network (and populates the cache) on a cache miss, so a
  // first-ever visit still works even if install() raced a slow link.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
