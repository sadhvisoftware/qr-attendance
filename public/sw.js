const CACHE_NAME = "qr-attendance-v1.7"; 

const urlsToCache = [
  "/",
  "/scan.html",
  "/admin.html",
  "/login.html",
  "/logo.png",
  "/favicon.ico"
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

/* FETCH */
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});