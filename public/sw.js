/* AIR BASKETBALL — offline service worker.
 *
 * Goal: after one online visit the whole game (app shell, hand-tracking engine,
 * model, logo) is stored on the device, so hand tracking works with no internet.
 *
 * Pages & JS chunks: network-first while online, cache-first when offline.
 * /mediapipe/* engine files: precached at install + topped up on demand.
 */
const VERSION = "air-bb-v5";
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

const CORE = [
  "/",
  "/manifest.webmanifest",
  "/brand/air-basketball-logo.png",
  "/mediapipe/hand_landmarker.task",
  "/mediapipe/wasm/vision_wasm_internal.js",
  "/mediapipe/wasm/vision_wasm_internal.wasm",
  "/mediapipe/wasm/vision_wasm_nosimd_internal.js",
  "/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
];

/** Pull every /_next/static asset referenced by the HTML so the shell boots offline. */
async function cacheShellAssets(cache) {
  try {
    const res = await fetch("/", { cache: "no-store" });
    if (!res.ok) return;
    await cache.put("/", res.clone());
    const html = await res.text();
    const urls = new Set();
    const re = /["'(](\/_next\/static\/[^"'()\s]+)["')]/g;
    let m;
    while ((m = re.exec(html))) urls.add(m[1].replace(/\\u0026/g, "&"));
    await Promise.all(
      [...urls].map((u) =>
        fetch(u)
          .then((r) => (r.ok ? cache.put(u, r) : undefined))
          .catch(() => undefined),
      ),
    );
  } catch {
    /* install ran while offline — the message handlers top things up later */
  }
}

async function coreMissing(cache) {
  const missing = [];
  for (const u of CORE) {
    const hit = await cache.match(u);
    if (!hit) missing.push(u);
  }
  return missing;
}

/** Download any core file that is not cached yet (no-op while offline). */
async function topUpCore() {
  const cache = await caches.open(SHELL);
  const missing = await coreMissing(cache);
  if (!missing.length) return missing;
  await Promise.all(
    missing.map(async (u) => {
      try {
        const r = await fetch(u, { cache: "no-store" });
        if (r.ok) await cache.put(u, r);
      } catch {
        /* offline or unavailable — will be reported as still missing */
      }
    }),
  );
  return coreMissing(cache);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await Promise.all(
        CORE.map((u) =>
          fetch(u, { cache: "no-store" })
            .then((r) => (r.ok ? cache.put(u, r) : undefined))
            .catch(() => undefined),
        ),
      );
      await cacheShellAssets(cache);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await topUpCore(); // repair partially failed installs
      await self.clients.claim();
    })(),
  );
});

/**
 * Page messages:
 *  CACHE_URLS — store every resource the page has loaded (incl. lazy JS chunks).
 *  ENSURE_CORE — verify the engine files, download gaps, then reply with CORE_STATUS.
 */
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "CACHE_URLS" && data.type !== "ENSURE_CORE") return;

  const respond = (missing) => {
    try {
      event.source && event.source.postMessage({ type: "CORE_STATUS", missing });
    } catch {
      const clients = self.clients.matchAll();
      clients.forEach((c) => c.postMessage({ type: "CORE_STATUS", missing }));
    }
  };

  event.waitUntil(
    (async () => {
      if (data.type === "CACHE_URLS" && Array.isArray(data.urls)) {
        const cache = await caches.open(RUNTIME);
        await Promise.all(
          data.urls.map(async (u) => {
            try {
              const url = new URL(u, self.location.origin);
              if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
              if (await caches.match(url.pathname + url.search)) return;
              const r = await fetch(url.pathname + url.search);
              if (r.ok) await cache.put(url.pathname + url.search, r);
            } catch {
              /* ignore */
            }
          }),
        );
      }
      respond(await topUpCore());
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // the game never needs the network API

  // pages: network first (fresh build), cached shell when offline
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(SHELL);
          cache.put("/", fresh.clone()).catch(() => undefined);
          return fresh;
        } catch {
          return (await caches.match("/")) || (await caches.match(req)) || Response.error();
        }
      })(),
    );
    return;
  }

  // static assets, wasm, model, images: cache first, then network (and remember it)
  event.respondWith(
    (async () => {
      const hit = await caches.match(req, { ignoreSearch: url.pathname.startsWith("/mediapipe/") });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok && (res.type === "basic" || res.type === "default")) {
          const cache = await caches.open(RUNTIME);
          cache.put(req, res.clone()).catch(() => undefined);
        }
        return res;
      } catch {
        return Response.error();
      }
    })(),
  );
});
