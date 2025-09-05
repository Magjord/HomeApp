/* Lightweight service worker for HomeApp */
const CACHE_VERSION = "v1";
const CACHE_NAME = `homeapp-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  // e.g. `${self.registration.scope}favicon.png`,
  // `${self.registration.scope}manifest.json`,
];

self.addEventListener("install", (event) => {
  // Precache the app shell (start page = scope root)
  const startUrl = self.registration.scope; // ends with a trailing slash
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const urls = [startUrl, ...PRECACHE_URLS];
      await cache.addAll(urls.map((u) => new Request(u, { cache: "reload" })));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Clean old caches
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
      await self.clients.claim();
    })()
  );
});

// Basic strategy:
// - For navigations: try network, fall back to cached start page, then fallback offline.html
// - For static assets (script/style/image/font): stale-while-revalidate from cache
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) return;

  // 1) Navigations (page loads / SPA deep links)
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // Try live first
          const fresh = await fetch(req);
          return fresh;
        } catch {
          // Fallback to cached start page (scope root)
          const cachedStart = await caches.match(self.registration.scope);
          if (cachedStart) return cachedStart;

          // Last resort: offline page if present
          const offline = await caches.match(`${self.registration.scope}offline.html`);
          if (offline) return offline;

          // Give up
          return new Response("Offline", { status: 503, statusText: "Offline" });
        }
      })()
    );
    return;
  }

  // 2) Static assets
  const dest = req.destination;
  if (["style", "script", "image", "font"].includes(dest)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        const fetchPromise = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);
        return cached || fetchPromise || new Response("", { status: 504 });
      })()
    );
  }
});
