/* ============================================================
   sw.js — the Service Worker. This is what makes the app work
   OFFLINE and feel native. It caches your files the first time,
   then serves them from cache so the app opens instantly even
   with no internet (e.g. on the plane to Phuket ✈️).

   How it works, in plain terms:
   1. "install" → save a copy of the core files in a cache box.
   2. "fetch"   → when the app asks for a file, hand back the
                  cached copy if we have it, else fetch from network.

   NOTE: bump CACHE_NAME's version number whenever you change
   files, so the browser knows to refresh its cached copies.
   ============================================================ */

const CACHE_NAME = "fitness-tracker-v2";
const CORE_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./js/data.js",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// Install: pre-cache the core files
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_FILES))
  );
  self.skipWaiting();
});

// Activate: clean up old caches from previous versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: serve from cache first, fall back to network
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
