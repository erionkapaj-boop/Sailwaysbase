// SkipperFinder — service worker
// Σκόπιμα ΔΕΝ κάνει caching σελίδων/αρχείων: κάθε deploy φαίνεται αμέσως, χωρίς κανείς
// να μένει σε παλιά έκδοση. Ρόλοι του: (1) να επιτρέπει την εγκατάσταση της εφαρμογής
// στην αρχική οθόνη, (2) να παραλαμβάνει τις ειδοποιήσεις (push) και να χτυπά το
// κινητό ακόμα και με κλειστή οθόνη, (3) να ανοίγει την εφαρμογή στη σωστή σελίδα
// όταν πατηθεί η ειδοποίηση. Το payload το φτιάχνει ο διακομιστής
// (lib/platform/pushMessage.js): { title, body, url, tag, badge }.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "SkipperFinder";
  const options = {
    body: payload.body || "",
    icon: "/skipperfinder-icon-192.png",
    badge: "/skipperfinder-icon-192.png",
    tag: payload.tag || undefined,
    renotify: Boolean(payload.tag), // η νεότερη με την ίδια ετικέτα ξαναχτυπά
    vibrate: [120, 60, 120],
    timestamp: Date.now(),
    data: { url: payload.url || "/platform" },
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      // Αριθμός αδιάβαστων στο εικονίδιο της εφαρμογής (όπου το υποστηρίζει η συσκευή).
      payload.badge && self.navigator && self.navigator.setAppBadge ? self.navigator.setAppBadge(payload.badge).catch(() => {}) : Promise.resolve(),
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/platform", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if ("navigate" in client && client.url !== target) {
          try { await client.navigate(target); } catch {}
        }
        return;
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

// Αν ο browser ανανεώσει μόνος του τη συσκευή (άλλο endpoint), η εφαρμογή την
// ξαναγράφει στο επόμενο άνοιγμα, από το προφίλ ή την ειδοποίηση.
self.addEventListener("pushsubscriptionchange", () => {});
