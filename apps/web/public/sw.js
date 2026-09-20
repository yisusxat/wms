// WMS Enterprise PWA Service Worker - Network First with Cache Fallback
const CACHE_NAME = "wms-cache-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Ignorar peticiones que no sean GET o que sean a endpoints de API de modificación
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clonar y almacenar respuesta en cache si es válida
        if (response && response.status === 200 && response.type === "basic") {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, resClone);
          });
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        // Fallback a raíz si es navegación HTML
        if (event.request.mode === "navigate") {
          return caches.match("/");
        }
        return new Response("Sin conexión", { status: 503, statusText: "Offline" });
      })
  );
});
