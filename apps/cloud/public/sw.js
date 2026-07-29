/* eslint-disable */
// ── Runory PWA Service Worker (v0.9.2) ──
//
// Per v0.5.1 Mobile Field-Work Spec §5.3 — Cache Policy:
//
//   | Resource                                         | Strategy                              |
//   |--------------------------------------------------|---------------------------------------|
//   | versioned JS/CSS/fonts/icons                     | cache-first, content-hash bounded     |
//   | manifest and offline page                        | stale-while-revalidate               |
//   | API, auth, command responses                      | network-only, no-store                |
//   | RSC/Flight/data requests                          | network-only                          |
//   | authenticated HTML                                | network-only                          |
//   | customer files, photos, signatures, Quote docs     | network-only, auth on every request   |
//
// The service worker MUST NOT cache tenant-specific or user-specific business
// responses. Deployment MUST set sw.js to no-cache, no-store, must-revalidate,
// clean old named caches, and expose a safe update/reload path.

const SW_VERSION = "runory-v0.9.2";
const STATIC_CACHE = `${SW_VERSION}-static`;
const APP_SHELL_CACHE = `${SW_VERSION}-shell`;

// Resources that are safe to cache (versioned static assets).
// Next.js serves content-hashed assets under /_next/static/.
const STATIC_ASSET_PATTERNS = [
  /\/_next\/static\//, // JS, CSS chunks (content-hashed)
  /\/_next\/favicon/,
  /\.(?:woff2?|ttf|otf|eot)$/i, // Fonts
];

// Resources served from the mobile public folder (icons, offline page, manifest).
const SHELL_ASSET_PATTERNS = [
  /\/m\/icons\//,
  /\/m\/manifest\.json$/,
  /\/m\/offline\.html$/,
];

// Never cache these — they are tenant/user-specific or require authorization.
const NEVER_CACHE_PATTERNS = [
  /\/api\//, // All API responses (business data, auth, commands)
  /\/_next\/data\//, // RSC/Flight data requests
  /\/_rsc\//, // Next.js RSC payload
  /\/auth\//, // Auth routes
  /\/login/, // Login pages
];

// ──────────────────────────────────────────────
// 1. INSTALL — precache the offline shell
// ──────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) =>
        cache.addAll([
          "/m/offline.html",
          "/m/manifest.json",
          "/m/icons/icon-192.png",
          "/m/icons/icon-512.png",
        ])
      )
      .then(() => self.skipWaiting())
      .catch(() => {
        // If precaching fails (e.g., some assets not yet deployed),
        // continue installing — the SW will still function for runtime caching.
        return self.skipWaiting();
      })
  );
});

// ──────────────────────────────────────────────
// 2. ACTIVATE — clean old caches, take control
// ──────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter(
              (name) =>
                name !== STATIC_CACHE &&
                name !== APP_SHELL_CACHE
            )
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ──────────────────────────────────────────────
// 3. FETCH — route by cache policy
// ──────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests; let everything else go to the network.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Only intercept same-origin requests.
  if (url.origin !== self.location.origin) return;

  // In local development, Next.js app chunks are not a stable production
  // deployment artifact. Cache-firsting them can keep old mobile route code
  // alive after source edits, which breaks local acceptance testing. Production
  // still gets the content-hash bounded static cache below.
  const isLocalDev =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1";
  if (isLocalDev && url.pathname.startsWith("/_next/static/chunks/")) {
    return;
  }

  // ── Rule: NEVER cache API, auth, RSC/Flight, or command responses ──
  // Per §5.3: "API, auth, command responses → network-only, no-store"
  //           "RSC/Flight/data requests → network-only"
  //           "customer files, photos, signatures, Quote documents → network-only"
  if (NEVER_CACHE_PATTERNS.some((p) => p.test(url.pathname))) {
    return; // Fall through to the browser's default network handling.
  }

  // ── Authenticated HTML: network-only ──
  // Per §5.3: "authenticated HTML → network-only"
  // Navigation requests (HTML pages) must always go to the network so that
  // expired sessions redirect to login and no cached customer data is shown.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // If the network succeeds, return the fresh response.
          return response;
        })
        .catch(() => {
          // Network failed (offline) — show the cached offline page.
          return caches.match("/m/offline.html").then(
            (offlineResponse) =>
              offlineResponse ||
              new Response("You are offline.", {
                status: 503,
                headers: { "Content-Type": "text/html" },
              })
          );
        })
    );
    return;
  }

  // ── Manifest and offline page: stale-while-revalidate ──
  // Per §5.3: "manifest and offline page → stale-while-revalidate"
  if (
    url.pathname === "/m/manifest.json" ||
    url.pathname === "/m/offline.html"
  ) {
    event.respondWith(staleWhileRevalidate(request, APP_SHELL_CACHE));
    return;
  }

  // ── Versioned static assets: cache-first (content-hash bounded) ──
  // Per §5.3: "versioned JS/CSS/fonts/icons → cache-first, content-hash bounded"
  // Next.js content-hashes these files, so the cache is naturally bounded —
  // a new deploy produces new URLs, and old entries are cleaned on activate.
  if (
    STATIC_ASSET_PATTERNS.some((p) => p.test(url.pathname)) ||
    SHELL_ASSET_PATTERNS.some((p) => p.test(url.pathname))
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // ── Default: network-only (no caching) ──
  // Any request not matched above goes straight to the network without caching.
  // This is the safe default that ensures we never accidentally cache
  // tenant-specific or user-specific business data.
});

// ──────────────────────────────────────────────
// 4. MESSAGE — allow the page to trigger an update
// ──────────────────────────────────────────────

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ──────────────────────────────────────────────
// 5. PUSH — display push notifications (v0.9.2 Spec §7)
// ──────────────────────────────────────────────
//
// Per §7 Browser & Service Worker contract: the push payload is a JSON
// object with { title, body, route, tag?, icon?, badge? }.  If the payload
// is missing or malformed we MUST NOT surface raw content to the user.

self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data ? event.data.json() : null;
  } catch (_e) {
    // Malformed payload — silently drop. Never display raw/partial content.
    return;
  }

  if (!payload || typeof payload !== "object") {
    return;
  }

  const title = typeof payload.title === "string" ? payload.title : "Runory";

  const options = {
    body: typeof payload.body === "string" ? payload.body : "",
    icon: typeof payload.icon === "string" ? payload.icon : "/m/icons/icon-192.png",
    badge: typeof payload.badge === "string" ? payload.badge : "/m/icons/icon-192.png",
    tag: typeof payload.tag === "string" ? payload.tag : undefined,
    data: {
      route: typeof payload.route === "string" ? payload.route : "/",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ──────────────────────────────────────────────
// 6. NOTIFICATIONCLICK — focus client or open route (v0.9.2 Spec §7)
// ──────────────────────────────────────────────
//
// Per §7: on click, close the notification, then either focus an existing
// same-origin client or open a new window to the route from the payload.
//
// Security: the route is validated to be a relative path.  Absolute URLs
// (e.g. "https://evil.com") and protocol-relative URLs ("//evil.com") are
// rejected.  The opened route always goes through normal authentication —
// push notifications never bypass auth.

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const rawRoute =
    event.notification.data && typeof event.notification.data.route === "string"
      ? event.notification.data.route
      : "/";

  // Validate route is a relative path — must start with "/" but not "//".
  let targetPath = "/";
  if (rawRoute.startsWith("/") && !rawRoute.startsWith("//")) {
    targetPath = rawRoute;
  }

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Prefer a same-origin client already on the target route.
      for (const client of clientList) {
        if (
          client.url.startsWith(self.location.origin) &&
          new URL(client.url).pathname === targetPath
        ) {
          return client.focus();
        }
      }

      // Fall back to any same-origin client.
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin)) {
          return client.focus();
        }
      }

      // No existing client — open a new window to the target route.
      // The route is relative, so it resolves against the origin and
      // never bypasses authentication.
      return self.clients.openWindow(targetPath);
    })()
  );
});

// ──────────────────────────────────────────────
// Cache strategy helpers
// ──────────────────────────────────────────────

/**
 * Cache-first strategy for versioned static assets.
 * Returns the cached response immediately if available; otherwise fetches
 * from the network and stores a copy. Content hashes in filenames bound the
 * cache — old versions are cleaned during activation.
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  try {
    const response = await fetch(request);
    // Only cache successful, basic (CORS) responses.
    if (response.ok && response.type === "basic") {
      cache.put(request, response.clone());
    }
    return response;
  } catch (_err) {
    // Network failed and nothing in cache — return a minimal fallback.
    return new Response("", { status: 504, statusText: "Gateway Timeout" });
  }
}

/**
 * Stale-while-revalidate strategy for manifest and offline page.
 * Returns the cached response immediately (if available) while fetching a
 * fresh copy in the background to update the cache for next time.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok && response.type === "basic") {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}
