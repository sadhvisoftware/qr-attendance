const CACHE_NAME = "qr-attendance-v1.3.5"; 

const urlsToCache = [
  "/",
  "/scan.html",
  "/admin.html",
  "/login.html",
  "/logo.png",
  "/favicon.ico",
  "/qr.html",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.json"
];

/* INSTALL */
self.addEventListener("install", (event) => {
  console.log("Service Worker Installing...");
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

/* ACTIVATE */
self.addEventListener("activate", (event) => {
  console.log("Service Worker Activated...");

  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    })
  );

  return self.clients.claim();
});

/* FETCH - NETWORK FIRST (UPDATED) */
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, response.clone());
          return response;
        });
      })
      .catch(() => caches.match(event.request))
  );
});


self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});