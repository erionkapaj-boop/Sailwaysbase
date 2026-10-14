import crypto from "node:crypto";
import webpush from "web-push";
import { vapidKeys, pushSeed } from "../../lib/platform/pushKeys.js";
import { buildPushMessage } from "../../lib/platform/pushMessage.js";
import { createTranslator } from "next-intl";
import fs from "node:fs";
import { PARTS } from "../../messages/parts.js";

let passed = 0;
const ok = (label, cond, detail) => {
  if (!cond) { console.error(`FAIL ${label}`, detail ?? ""); process.exitCode = 1; return; }
  console.log(`ok   ${label}`);
  passed++;
};

// --- Κλειδιά ---------------------------------------------------------------
const a = vapidKeys("seed-seed-seed-seed-1");
const b = vapidKeys("seed-seed-seed-seed-1");
const c = vapidKeys("seed-seed-seed-seed-2");
ok("ίδιο μυστικό → ίδια κλειδιά (σταθερά ανάμεσα στα deploy)", a && a.publicKey === b.publicKey && a.privateKey === b.privateKey);
ok("άλλο μυστικό → άλλα κλειδιά", a.publicKey !== c.publicKey);
ok("δημόσιο κλειδί: 65 bytes (μη συμπιεσμένο σημείο P-256)", Buffer.from(a.publicKey, "base64url").length === 65 && Buffer.from(a.publicKey, "base64url")[0] === 4);
ok("ιδιωτικό κλειδί: 32 bytes", Buffer.from(a.privateKey, "base64url").length === 32);
ok("χωρίς μυστικό ή πολύ σύντομο → τίποτα", vapidKeys("") === null && vapidKeys("abc") === null);
ok("προτεραιότητα στο PLATFORM_PUSH_SEED", pushSeed({ PLATFORM_PUSH_SEED: "x".repeat(20), PLATFORM_SUPABASE_SERVICE_ROLE_KEY: "y".repeat(20) }) === "x".repeat(20) && pushSeed({ PLATFORM_SUPABASE_SERVICE_ROLE_KEY: "y".repeat(20) }) === "y".repeat(20));

// Η βιβλιοθήκη αποστολής δέχεται τα κλειδιά και φτιάχνει σωστό αίτημα προς μια συσκευή.
const device = crypto.createECDH("prime256v1");
device.generateKeys();
const sub = { endpoint: "https://push.example.test/send/abc123abc123abc123", keys: { p256dh: device.getPublicKey().toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") } };
const req = webpush.generateRequestDetails(sub, JSON.stringify({ title: "Δοκιμή" }), { vapidDetails: { subject: "mailto:test@example.test", publicKey: a.publicKey, privateKey: a.privateKey }, TTL: 3600, urgency: "high" });
ok("αίτημα προς την υπηρεσία push: vapid, κρυπτογραφημένο σώμα, προτεραιότητα", req.headers.Authorization?.startsWith("vapid ") && req.headers["Content-Encoding"] === "aes128gcm" && req.headers.Urgency === "high" && req.body.length > 100 && req.endpoint === sub.endpoint, req.headers);

// --- Κείμενο ---------------------------------------------------------------
async function translators(locale) {
  const messages = Object.assign({}, ...PARTS.map((p) => JSON.parse(fs.readFileSync(new URL(`../../messages/${locale}/${p}.json`, import.meta.url), "utf8"))));
  const mk = (namespace) => createTranslator({ locale, messages, namespace, onError: () => {} });
  return { t: mk("Push"), tNotification: mk("Notification"), tRole: mk("Roles"), locale };
}
const el = await translators("el");
const en = await translators("en");
const m1 = buildPushMessage({ id: "1", kind: "message_received", data: { booking_id: "bk1" }, link: "/platform/bookings?focus=bk1", unread: 3 }, el);
ok("μήνυμα συνομιλίας: μόνο ότι υπάρχει νέο, με σύνδεσμο στην κράτηση", m1.title === "Νέο μήνυμα" && m1.url === "/platform/bookings?focus=bk1" && m1.badge === 3 && !/[0-9]{9}/.test(m1.body), m1);
const m2 = buildPushMessage({ id: "2", kind: "message_received", data: { booking_id: "bk1" }, link: "/platform/bookings?focus=bk1" }, en);
ok("αγγλικά: «New message»", m2.title === "New message" && m2.badge === undefined);
ok("ίδια συνομιλία = ίδια ετικέτα (η νεότερη αντικαθιστά)", m1.tag === m2.tag);
const m3 = buildPushMessage({ id: "3", kind: "request_received", data: { port: "Σύρος", start: "2026-06-10", end: "2026-06-17" }, link: "/platform/requests" }, el);
ok("ειδοποίηση με κείμενο της εφαρμογής (νέο αίτημα, με λιμάνι)", m3.title.length > 3 && /Σύρος/.test(m3.body) && m3.url === "/platform/requests", m3);
const m4 = buildPushMessage({ id: "4", kind: "request_received", data: { port: "Σύρος", start: "2026-06-10", end: "2026-06-17" }, link: "/platform/requests" }, en);
ok("αγγλικά: χωρίς ελληνικά γράμματα στον τίτλο", !/[Ͱ-Ͽ]/.test(m4.title), m4.title);
const m5 = buildPushMessage({ id: "5", kind: "push_test", data: {}, link: "/platform/profile" }, el);
ok("δοκιμαστική ειδοποίηση", m5.title === "Δοκιμαστική ειδοποίηση");
const m6 = buildPushMessage({ id: "6", kind: "request_received", data: {}, link: "https://evil.example/x" }, el);
ok("εξωτερικός σύνδεσμος δεν περνά (πάντα μέσα στην εφαρμογή)", m6.url === "/platform");
const m7 = buildPushMessage({ id: "7", kind: "κάτι_άγνωστο", data: {}, link: null }, el);
ok("άγνωστο είδος δεν σπάει: δίνει τίτλο", typeof m7.title === "string" && m7.title.length > 0, m7);

console.log(`${passed} έλεγχοι`);
