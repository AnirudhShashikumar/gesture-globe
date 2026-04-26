/**
 * sw.js — Gesture Globe Service Worker
 *
 * Strategy:
 *  • INSTALL  — pre-cache the app shell (offline page + icons)
 *  • FETCH    — Cache-First for static assets (/icons, /_next/static, images)
 *             — Network-First for everything else (HTML navigations, API routes)
 *             — Offline fallback → /offline.html for failed navigations
 *
 * Keep sw.js served with  Cache-Control: no-cache  so updates are picked up
 * immediately (configured in next.config.ts headers).
 */

const CACHE_VERSION = "v1";
const SHELL_CACHE   = `gesture-globe-shell-${CACHE_VERSION}`;
const ASSET_CACHE   = `gesture-globe-assets-${CACHE_VERSION}`;

/** Files pre-cached on install — the absolute minimum offline shell. */
const SHELL_ASSETS = [
  "/offline.html",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

// ─── INSTALL ────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  // Pre-cache the shell; skip waiting so the new SW activates immediately.
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ───────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  // Remove stale caches from previous versions.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── FETCH ──────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests; let third-party CDN requests pass through.
  if (url.origin !== self.location.origin) return;

  // ── API routes: Network-First ──────────────────────────────────────────
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request));
    return;
  }

  // ── Static assets: Cache-First ──────────────────────────────────────────
  // _next/static contains fingerprinted JS/CSS chunks — safe to cache forever.
  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon-")         ||
    url.pathname.startsWith("/apple-touch")   ||
    /\.(png|jpg|jpeg|svg|ico|webp|woff2?)$/.test(url.pathname);

  if (isStaticAsset) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // ── HTML navigations & everything else: Network-First ──────────────────
  event.respondWith(networkFirst(request));
});

// ─── STRATEGIES ─────────────────────────────────────────────────────────────

/**
 * Cache-First — serve from cache; on miss fetch, cache, then return.
 * @param {Request} request
 * @param {string}  cacheName
 */
async function cacheFirst(request, cacheName) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // Only cache valid, non-opaque responses.
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    // For image misses we just let it fail — no meaningful fallback.
    return new Response("Asset unavailable offline.", { status: 503 });
  }
}

/**
 * Network-First — try network; on failure serve cache; final fallback for
 * navigation requests is the offline page.
 * @param {Request} request
 */
async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);

  try {
    const response = await fetch(request);
    // Cache successful GET responses for offline re-use.
    if (response.ok && request.method === "GET") {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    // Navigation fallback → offline page.
    if (request.mode === "navigate") {
      return cache.match("/offline.html");
    }

    return new Response("Offline.", { status: 503 });
  }
}
