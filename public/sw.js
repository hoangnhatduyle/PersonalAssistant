// Cadence service worker. Its main job is to satisfy PWA installability (a
// registered worker with a fetch handler) so the app can be added to the
// home screen. It deliberately does NOT cache responses: this is an
// authenticated app with per-request data, so the fetch handler is a
// transparent pass-through to the network.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pass-through. Present so the browser considers the app installable;
  // no offline caching of authenticated data.
  event.respondWith(fetch(event.request));
});
