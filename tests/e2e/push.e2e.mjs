// Ειδοποιήσεις στο κινητό (0129): ο διακομιστής στέλνει ό,τι περιμένει στην
// ουρά στη «υπηρεσία push» κάθε συσκευής (εδώ μια ψεύτικη τοπική υπηρεσία),
// σβήνει τις συσκευές που δεν υπάρχουν πια, και οι οθόνες ενεργοποίησης δουλεύουν.
// Το πραγματικό κουδούνισμα σε κινητό δεν δοκιμάζεται εδώ (θέλει υπηρεσία της Google/Apple).
import http from "node:http";
import crypto from "node:crypto";
import { chromium } from "playwright";
import { BASE, go, text, check, finish, sql, num, hydrationOnly } from "./lib.mjs";
import { TEST_PIN } from "./gateway.mjs";

const NIKOS = "a0000000-0000-0000-0000-000000000003";
const CRON_SECRET = "e2e-cron-secret";
const trusted = (q) => sql(`select set_config('platform.trusted','true',false); ${q}`);

// --- ψεύτικη υπηρεσία push ---------------------------------------------------
const received = [];
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    received.push({ url: req.url, headers: req.headers, bytes: Buffer.concat(chunks).length });
    const status = req.url.startsWith("/gone/") ? 410 : req.url.startsWith("/busy/") ? 503 : 201;
    res.writeHead(status);
    res.end();
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;
const device = (kind, n) => {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { endpoint: `http://127.0.0.1:${PORT}/${kind}/${n}-${"x".repeat(24)}`, p256dh: ecdh.getPublicKey().toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") };
};
const addDevice = (d) => trusted(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ('${NIKOS}', '${d.endpoint}', '${d.p256dh}', '${d.auth}')`);
const callSender = (secret = CRON_SECRET) => fetch(`${BASE}/api/platform/push`, { method: "POST", headers: secret ? { Authorization: `Bearer ${secret}` } : {} });

trusted(`delete from push_outbox; delete from push_subscriptions`);

console.log("\n== 1. Ο διακομιστής");
check("χωρίς κωδικό cron: 401", (await callSender(null)).status === 401);
check("λάθος κωδικός: 401", (await callSender("wrong-secret")).status === 401);
const keyRes = await fetch(`${BASE}/api/platform/push/key`);
const keyJson = await keyRes.json();
check("δημόσιο κλειδί για τους browsers (65 bytes)", keyJson.ok && Buffer.from(keyJson.key, "base64url").length === 65, keyJson);
let r = await (await callSender()).json();
check("άδεια ουρά: τίποτα να σταλεί", r.ok && r.claimed === 0, r);

console.log("\n== 2. Αποστολή στη συσκευή");
const good = device("ok", 1);
addDevice(good);
trusted(`select notify_user('${NIKOS}', 'request_received', '{"port":"Σύρος","start":"2026-06-10","end":"2026-06-17"}'::jsonb, '/platform/requests')`);
check("η ειδοποίηση μπήκε στην ουρά", num(`select count(*) from push_outbox where user_id = '${NIKOS}' and status is null`) === 1);
r = await (await callSender()).json();
check("στάλθηκε σε μία συσκευή", r.ok && r.claimed === 1 && r.sent === 1, r);
check("η υπηρεσία push έλαβε αίτημα με υπογραφή vapid και κρυπτογραφημένο σώμα",
  received.length === 1 && received[0].url.startsWith("/ok/") && received[0].headers.authorization?.startsWith("vapid ") && received[0].headers["content-encoding"] === "aes128gcm" && received[0].bytes > 100 && received[0].headers.urgency === "high", received[0]);
check("σημειώθηκε ως σταλμένο", num(`select count(*) from push_outbox where status = 'sent'`) === 1);
check("η συσκευή σημειώθηκε ως ενεργή", num(`select count(*) from push_subscriptions where endpoint = '${good.endpoint}' and last_ok_at is not null`) === 1);
r = await (await callSender()).json();
check("δεύτερη κλήση: δεν ξαναστέλνεται τίποτα", r.claimed === 0 && received.length === 1, r);

console.log("\n== 3. Συσκευή που δεν υπάρχει πια");
const dead = device("gone", 2);
addDevice(dead);
trusted(`select notify_user('${NIKOS}', 'booking_confirmed', '{"port":"Πάρος"}'::jsonb, '/platform/bookings')`);
r = await (await callSender()).json();
check("η ζωντανή συσκευή παίρνει την ειδοποίηση, η νεκρή σβήνεται", r.sent === 1 && r.removed_devices === 1 && num(`select count(*) from push_subscriptions where endpoint = '${dead.endpoint}'`) === 0 && num(`select count(*) from push_subscriptions where endpoint = '${good.endpoint}'`) === 1, r);
check("η υπηρεσία είδε και τις δύο συσκευές", received.filter((x) => x.url.startsWith("/gone/")).length === 1 && received.filter((x) => x.url.startsWith("/ok/")).length === 2);

console.log("\n== 4. Προσωρινό πρόβλημα: ξαναδοκιμάζεται");
trusted(`delete from push_subscriptions`);
const busy = device("busy", 3);
addDevice(busy);
trusted(`select notify_user('${NIKOS}', 'booking_confirmed', '{}'::jsonb, '/platform/bookings')`);
r = await (await callSender()).json();
check("503 από την υπηρεσία: μένει για επανάληψη", r.retry === 1 && num(`select count(*) from push_outbox where status is null`) === 1, r);
trusted(`delete from push_subscriptions; delete from push_outbox`);

console.log("\n== 5. Οι οθόνες");
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["notifications"] });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => hydrationOnly(e, page) || errors.push(`${e.message} @ ${page.url()}`));
  await page.goto(`${BASE}/platform/login`);
  await page.waitForLoadState("networkidle");
  const inputs = page.locator("input");
  await inputs.nth(0).fill("6900002003");
  await inputs.nth(1).fill(TEST_PIN);
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 });
  await page.waitForTimeout(1500);
  check("το service worker καταχωρείται", await page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration("/"))));
  check("το service worker δεν κρατά αντίγραφα σελίδων (κάθε deploy φαίνεται αμέσως)", (await page.evaluate(async () => (await caches.keys()).length)) === 0);
  // Ο browser των τεστ στο CI (headless shell) δεν έχει ειδοποιήσεις· τοπικά έχει.
  // Η εφαρμογή πρέπει να κάνει το σωστό και στις δύο περιπτώσεις.
  const mode = await page.evaluate(() => (!("PushManager" in window && "Notification" in window) ? "unsupported" : Notification.permission === "denied" ? "denied" : "ok"));
  const pushSupported = mode === "ok";
  console.log(`   (ειδοποιήσεις στον browser των τεστ: ${mode})`);
  if (pushSupported) {
    await page.waitForSelector("[data-push-prompt]", { timeout: 15000 }).catch(() => {}); // περιμένει το service worker να ενεργοποιηθεί
    check("η πρόταση ειδοποιήσεων εμφανίζεται μετά τη σύνδεση", (await page.locator("[data-push-prompt]").count()) === 1, (await text(page)).slice(0, 300));
    await page.locator("[data-push-prompt-later]").click();
    await page.waitForTimeout(300);
    check("«Αργότερα» την κρύβει και το θυμάται", (await page.locator("[data-push-prompt]").count()) === 0 && Number(await page.evaluate(() => localStorage.getItem("sf_push_prompt_until"))) > Date.now());
  } else {
    await page.waitForTimeout(1500);
    check(`browser ${mode}: καμία πρόταση`, (await page.locator("[data-push-prompt]").count()) === 0);
  }

  await go(page, "/platform/profile");
  check("το προφίλ έχει την ενότητα «Ειδοποιήσεις στο κινητό»", (await page.locator("[data-push-settings]").count()) === 1 && (await text(page)).includes("Ειδοποιήσεις στο κινητό"));
  if (pushSupported) {
    check("δείχνει ότι δεν είναι ενεργές, με κουμπί ενεργοποίησης", (await page.locator('[data-push-state="off"]').count()) === 1 && (await page.locator("[data-push-on]").count()) === 1);
    await page.locator("[data-push-on]").click();
    await page.waitForTimeout(2500);
    const afterClick = await text(page);
    check("χωρίς υπηρεσία push (offline) δεν σπάει: μήνυμα, όχι σφάλμα σελίδας", afterClick.includes("Δεν ενεργοποιήθηκαν") || afterClick.includes("Ενεργές σε αυτή"), afterClick.slice(0, 500));
  } else {
    const t = await text(page);
    check(`browser ${mode === "denied" ? "με κλειστές ειδοποιήσεις" : "χωρίς ειδοποιήσεις"}: το λέει`,
      mode === "denied" ? t.includes("Οι ειδοποιήσεις είναι κλειστές") : t.includes("δεν υποστηρίζει ειδοποιήσεις") && (await page.locator("[data-push-on]").count()) === 0, t.slice(0, 500));
  }
  await page.screenshot({ path: new URL("./output/design-push-settings-m.png", import.meta.url).pathname });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: new URL("./output/design-push-settings-d.png", import.meta.url).pathname });
  await ctx.close();
}
{
  // iPhone στον browser: οι ειδοποιήσεις θέλουν την εφαρμογή στην αρχική οθόνη.
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => hydrationOnly(e, page) || errors.push(`${e.message} @ ${page.url()}`));
  await page.goto(`${BASE}/platform/login`);
  await page.waitForLoadState("networkidle");
  const inputs = page.locator("input");
  await inputs.nth(0).fill("6900002003");
  await inputs.nth(1).fill(TEST_PIN);
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 });
  await go(page, "/platform/profile");
  check("iPhone στον browser: οδηγία «Προσθήκη στην αρχική οθόνη», χωρίς κουμπί ενεργοποίησης", (await page.locator("[data-push-ios]").count()) === 1 && (await page.locator("[data-push-on]").count()) === 0);
  await page.screenshot({ path: new URL("./output/design-push-ios-m.png", import.meta.url).pathname });
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => hydrationOnly(e, page) || errors.push(`${e.message} @ ${page.url()}`));
  await page.goto(`${BASE}/platform/login`);
  await page.waitForLoadState("networkidle");
  const inputs = page.locator("input");
  await inputs.nth(0).fill("6900002003");
  await inputs.nth(1).fill(TEST_PIN);
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 });
  await go(page, "/platform/profile");
  const en = await page.locator("[data-push-settings]").innerText();
  check("αγγλικά: η ενότητα χωρίς ελληνικά γράμματα", en.includes("Phone notifications") && !/[Ͱ-Ͽ]/.test(en), en);
  await ctx.close();
}
await browser.close();
check("χωρίς σφάλματα σελίδας", errors.length === 0, errors.join(" | "));

trusted(`delete from push_subscriptions; delete from push_outbox; update users set locale = 'el' where id = '${NIKOS}'`);
server.close();
finish();
