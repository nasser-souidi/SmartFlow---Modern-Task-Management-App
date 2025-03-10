const CACHE_NAME = "todo-cache-v2";
const urlsToCache = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/manifest.json",
  "/icon.png",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css",
  "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Montserrat:wght@400;500;700&display=swap",
  "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.11.4/gsap.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.11.4/Draggable.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
];

self.addEventListener("install", (event) => {
  console.log("[Service Worker] Installation");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Mise en cache des ressources");
      return cache.addAll(urlsToCache);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  console.log("[Service Worker] Activation");
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheWhitelist.includes(cacheName)) {
            console.log("[Service Worker] Suppression de l’ancien cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        console.log("[Service Worker] Ressource trouvée dans le cache:", event.request.url);
        return response;
      }
      console.log("[Service Worker] Récupération réseau:", event.request.url);
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== "basic") {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    }).catch(() => {
      console.log("[Service Worker] Échec réseau, réponse hors ligne");
      return caches.match("/index.html");
    })
  );
});

const promisifyRequest = (request) => {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("TaskDB", 2);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("tasks")) {
        db.createObjectStore("tasks", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-tasks") {
    console.log("[Service Worker] Synchronisation en arrière-plan déclenchée");
    event.waitUntil(syncTasks());
  }
});

const syncTasks = async () => {
  try {
    const db = await openDB();
    const tx = db.transaction("tasks", "readonly");
    const store = tx.objectStore("tasks");
    const tasks = await promisifyRequest(store.getAll());

    const updatedTasks = tasks; // Simulation locale directe

    const writeTx = db.transaction("tasks", "readwrite");
    const writeStore = writeTx.objectStore("tasks");
    updatedTasks.forEach(task => writeStore.put(task));
    await writeTx.commit();

    console.log("[Service Worker] Tâches synchronisées:", updatedTasks);

    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({ type: "TASKS_SYNCED", tasks: updatedTasks });
      });
    });
  } catch (error) {
    console.error("[Service Worker] Échec de la synchronisation:", error);
  }
};