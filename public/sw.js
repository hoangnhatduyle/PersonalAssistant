// Cadence service worker. Two jobs:
//
//  1. Satisfy PWA installability (a registered worker with a fetch handler) so
//     the app can be added to the home screen. It deliberately does NOT cache
//     responses: this is an authenticated app with per-request data, so the
//     fetch handler is a transparent pass-through to the network.
//  2. Show reminder notifications delivered over Web Push (server side:
//     src/lib/push/send-push.ts) and open the right screen when one is tapped.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pass-through. Present so the browser considers the app installable;
  // no offline caching of authenticated data.
  event.respondWith(fetch(event.request));
});

// Only ever navigate to a path inside this app. The payload comes off the wire,
// so a "//evil.example" or "https://evil.example" must fall back to the root
// rather than be opened.
function safeAppPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

self.addEventListener("push", (event) => {
  // iOS Safari revokes a push subscription whose pushes do not result in a
  // visible notification, so this handler must ALWAYS show one -- even when the
  // payload is missing or unparseable -- and must never throw before doing so.
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  if (payload === null || typeof payload !== "object") payload = {};

  const title = typeof payload.title === "string" && payload.title ? payload.title : "Cadence";
  const options = {
    body: typeof payload.body === "string" && payload.body ? payload.body : "You have a reminder.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: safeAppPath(payload.url) },
  };
  // Notifications sharing a tag replace each other instead of stacking.
  if (typeof payload.tag === "string" && payload.tag) options.tag = payload.tag;

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(safeAppPath(event.notification.data && event.notification.data.url), self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        // navigate() can reject (e.g. a client that is not controlled yet); the
        // window is already focused, so landing on its current screen beats failing.
        if ("navigate" in client) await client.navigate(target).catch(() => undefined);
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
