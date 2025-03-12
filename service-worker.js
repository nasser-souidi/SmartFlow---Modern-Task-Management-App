const CACHE_NAME = "todo-cache-v3";
const urlsToCache = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/manifest.json",
  "/icon.png",
  "/node_modules/flatpickr/dist/flatpickr.min.css",
  "/node_modules/flatpickr/dist/flatpickr.min.js",
  "/node_modules/flatpickr/dist/l10n/fr.js",
  "/node_modules/flatpickr/dist/l10n/ar.js",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css",
  "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Montserrat:wght@400;500;700&display=swap",
  "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.11.4/gsap.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.11.4/Draggable.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
];

const IS_DEV = self.location.hostname === "127.0.0.1" || self.location.hostname === "localhost";

self.addEventListener("install", (event) => {
  console.log("[Service Worker] Installation");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Mise en cache des ressources");
      return cache.addAll(urlsToCache);
    }).catch((error) => console.error("[Service Worker] Erreur de mise en cache:", error))
  );
});

self.addEventListener("activate", (event) => {
  console.log("[Service Worker] Activation");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("[Service Worker] Suppression de l'ancien cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (IS_DEV) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, response.clone());
            return response;
          });
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== "basic") {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        return networkResponse;
      });
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data.type === "UPDATE_THEME_COLOR") {
    console.log("[Service Worker] Mise à jour de la couleur du thème:", event.data.themeColor);
  }
});