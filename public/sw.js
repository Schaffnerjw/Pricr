/* Pricr service worker — app-shell caching with a network-first navigation strategy.
 * NEVER caches API calls (Railway proxy / Supabase): those are always network-only.
 * Bump CACHE_VERSION to invalidate old caches on deploy. */
const CACHE_VERSION = "pricr-v1";
const SHELL = ["/", "/index.html", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

// Hosts whose requests must never be cached (live data / AI).
const NO_CACHE_HOST = /(\.supabase\.co|\.railway\.app)$/i;

const OFFLINE_HTML =
  `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>` +
  `<title>Pricr — offline</title><style>html,body{height:100%;margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;` +
  `background:#0A0E1A;color:#E2E8F0;display:flex;align-items:center;justify-content:center;text-align:center}` +
  `div{padding:24px}h1{color:#2979FF;margin:0 0 8px}p{color:#94A3B8}</style></head>` +
  `<body><div><h1>You're offline</h1><p>Reconnect to keep building quotes with Pricr.</p></div></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never touch POST/PATCH (API writes)

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // API / live data → straight to network, never cached.
  if (NO_CACHE_HOST.test(url.hostname) || url.origin !== self.location.origin) {
    return; // let the browser handle it normally
  }

  // Navigations → network-first, fall back to cached shell, then an offline page.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/index.html")).then((hit) => hit || new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html" } }))),
    );
    return;
  }

  // Same-origin static assets → cache-first, then network (and cache it for next time).
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === "basic") {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => hit)),
  );
});
