/* Requi Trading service worker — minimal, required for Chrome installability.
   Network-first for API, cache-first only for static build assets. */
const CACHE = "requi-static-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never cache API traffic or non-GET requests.
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  // Only cache hashed build assets; everything else goes to network.
  if (!url.pathname.startsWith("/assets/") && !url.pathname.startsWith("/icons/")) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(event.request);
      if (hit) return hit;
      const resp = await fetch(event.request);
      if (resp.ok) cache.put(event.request, resp.clone());
      return resp;
    }),
  );
});
