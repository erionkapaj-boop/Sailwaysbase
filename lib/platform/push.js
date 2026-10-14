"use client";
import { savePushSubscription, removePushSubscription, pushSubscriptionActive } from "./db";

// Ειδοποιήσεις στο κινητό, από την πλευρά του browser (ο διακομιστής ζει στο
// app/api/platform/push). Ο μηχανισμός είναι το service worker /sw.js, που
// παραλαμβάνει τα push ακόμα και με κλειστή την εφαρμογή.

export const SW_URL = "/sw.js";

const toBytes = (b64url) => {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const toB64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// Τι μπορεί να κάνει αυτή η συσκευή. Στο iPhone οι ειδοποιήσεις υπάρχουν μόνο
// όταν η εφαρμογή έχει προστεθεί στην αρχική οθόνη (ios && !standalone).
export function pushCapability() {
  if (typeof window === "undefined") return { supported: false, ios: false, standalone: false, permission: "default" };
  const ua = navigator.userAgent || "";
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true;
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return { supported, ios, standalone, permission: "Notification" in window ? Notification.permission : "denied" };
}

let registering = null;
export function registerWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return Promise.resolve(null);
  if (!registering) {
    registering = navigator.serviceWorker
      .register(SW_URL, { scope: "/", updateViaCache: "none" })
      .then(async (reg) => {
        // Κάθε φορά που ανοίγει η εφαρμογή, ψάχνει νέα έκδοση του worker (κάθε deploy).
        reg.update().catch(() => {});
        return reg;
      })
      .catch(() => null);
  }
  return registering;
}

async function currentSubscription() {
  const reg = await registerWorker();
  if (!reg) return null;
  await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

// Αυτή η συσκευή: ενεργή για τον τωρινό χρήστη;
export async function deviceIsSubscribed() {
  try {
    const sub = await currentSubscription();
    if (!sub) return false;
    return await pushSubscriptionActive(sub.endpoint);
  } catch {
    return false;
  }
}

// Ζητά άδεια και γράφει τη συσκευή. Επιστρέφει "ok" ή κωδικό σφάλματος:
// unsupported | denied | not_configured | failed.
export async function enablePush() {
  const cap = pushCapability();
  if (!cap.supported) return "unsupported";
  const permission = cap.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  try {
    const keyRes = await fetch("/api/platform/push/key");
    if (!keyRes.ok) return "not_configured";
    const { key } = await keyRes.json();
    const reg = await registerWorker();
    if (!reg) return "failed";
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    // Συσκευή με παλιά κλειδιά (άλλαξε το μυστικό του διακομιστή): ξαναγίνεται.
    if (sub && toB64url(sub.options.applicationServerKey) !== key) {
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(key) });
    const json = sub.toJSON();
    await savePushSubscription({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, userAgent: navigator.userAgent });
    return "ok";
  } catch {
    return "failed";
  }
}

export async function disablePush() {
  try {
    const sub = await currentSubscription();
    if (!sub) return;
    await removePushSubscription(sub.endpoint).catch(() => {});
    await sub.unsubscribe();
  } catch {}
}
