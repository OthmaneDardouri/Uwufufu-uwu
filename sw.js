// Service worker: makes the site installable and usable with a flaky connection.
//  - same-origin files: network first, cache as fallback (updates show up immediately)
//  - pictures (PokeAPI artwork, Wikimedia): cache first, they never change
//  - /api/*: never cached
const VERSION = "v1";
const SHELL = `shell-${VERSION}`;
const PICS = `pics-${VERSION}`;
const MAX_PICS = 600;
const PIC_HOSTS = ["raw.githubusercontent.com", "upload.wikimedia.org"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(["./", "index.html", "assets/css/style.css", "assets/css/fonts.css", "src/main.js"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => ![SHELL, PICS].includes(k)).map((k) => caches.delete(k)))));
  self.clients.claim();
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(k);
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  if (PIC_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(PICS).then(async (cache) => {
      const hit = await cache.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok || res.type === "opaque") { cache.put(e.request, res.clone()); trim(PICS, MAX_PICS); }
      return res;
    }));
    return;
  }

  if (url.origin !== location.origin || url.pathname.includes("/api/")) return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then((hit) => hit ?? caches.match("index.html"))));
});
