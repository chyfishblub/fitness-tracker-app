/* ============================================================
   sw.js — the Service Worker. Caches the app shell so it opens
   instantly, and handles Web Push notifications for meal-window
   reminders (see docs/REFERENCE.md §5).

   NOTE: bump CACHE_NAME's version number whenever you change
   files, so the browser knows to refresh its cached copies.
   ============================================================ */

const CACHE_NAME = "fitness-tracker-v4";
const CORE_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./js/config.js",
  "./js/supabase.js",
  "./js/data.js",
  "./js/plan.js",
  "./js/auth.js",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
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

// Fetch: serve the app shell from cache first, fall back to network.
// Supabase API/storage calls aren't in CORE_FILES so they always hit the network.
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// Push: show a notification for the meal window the Edge Function is nudging about.
self.addEventListener("push", (event) => {
  let payload = { title: "Fitness Tracker", body: "Time to log a meal 📸", url: "./" };
  try { payload = { ...payload, ...event.data.json() }; } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      data: { url: payload.url },
    })
  );
});

// Notification click: focus an open tab if there is one, else open a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
