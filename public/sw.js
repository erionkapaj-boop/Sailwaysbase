// Sailways Base — service worker
// Σκόπιμα ΔΕΝ κάνει caching σελίδων/αρχείων: κάθε update της εφαρμογής πρέπει να φαίνεται αμέσως,
// χωρίς κανείς να βλέπει παλιά, cached έκδοση. Ο μοναδικός του ρόλος προς το παρόν είναι να επιτρέψει
// την εγκατάσταση της εφαρμογής στην αρχική οθόνη. Ο χειρισμός ειδοποιήσεων (push) είναι έτοιμος
// από τώρα, αλλά ανενεργός μέχρι να συνδεθεί με πραγματικές ειδοποιήσεις σε επόμενο βήμα.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Έτοιμο για το επόμενο βήμα (push notifications) — προς το παρόν δεν στέλνεται ποτέ push, οπότε δεν κάνει τίποτα ακόμα.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json(); } catch { payload = { title: "Sailways Base", body: event.data.text() }; }
  const title = payload.title || "Sailways Base";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: payload.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
