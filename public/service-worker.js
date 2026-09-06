/**
 * Static asset cache.
 *
 * Version bumped to v12: the previous list pointed at ./script.js, ./style.css
 * and friends, which no longer exist after the restructure. Anyone carrying the
 * v11 cache would otherwise be served a stale shell forever.
 *
 * Two behaviour changes from v11:
 *  - /api/ is never cached. Catalog responses are already cached server-side
 *    with a TTL; caching them here too would pin stale rankings and countdowns
 *    in the browser with no way to invalidate them.
 *  - HTML uses network-first so a deploy is picked up on the next navigation,
 *    while JS/CSS/assets stay cache-first for speed.
 */

const CACHE_NAME = "mirai-static-v22";

const STATIC_ASSETS = [
  "./",
  "./home.html",
  "./css/home.min.css",
  "./css/modal.css",
  "./css/tutorial.css",
  "./js/pages/home.js",
  "./js/pages/common.js",
  "./js/features/spotlight-hero.js",
  "./js/core/escape.js",
  "./js/core/storage.js",
  "./js/core/api-client.js",
  "./assets/logo.png",
  "./assets/hero-400.jpg",
  "./assets/hero-800.jpg",
  "./assets/Saberfanart-400.jpg",
  "./assets/mirai-logo-360.jpg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // addAll rejects the whole install if any single entry 404s; add
      // individually so one missing optional asset cannot block activation.
      Promise.allSettled(STATIC_ASSETS.map(asset => cache.add(asset)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API traffic — freshness is the server's job.
  if (url.pathname.startsWith("/api/")) return;

  const isHtml = request.mode === "navigate" || url.pathname.endsWith(".html");

  if (isHtml) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match("./home.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached =>
      cached || fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })
    )
  );
});
