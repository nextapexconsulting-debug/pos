/* Voice POS service worker – cache shell for offline open */
const CACHE = "voice-pos-v2";
const PRECACHE = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];
// Warm the main screens so they open offline even if never visited. Best-effort:
// one failing route must not break the install.
const WARM = ["/orders", "/customers", "/dashboard", "/expenses", "/stock", "/printer", "/menu"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) =>
        c.addAll(PRECACHE).then(() =>
          Promise.all(WARM.map((u) => c.add(u).catch(() => {})))
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Never cache API / auth / supabase
  if (url.pathname.startsWith("/api/") || url.hostname.includes("supabase")) {
    return;
  }

  // Network-first for navigations (HTML pages)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("/"))
        )
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.match(/\.(js|css|png|svg|ico|woff2?)$/) || url.pathname.startsWith("/_next/static"))) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
