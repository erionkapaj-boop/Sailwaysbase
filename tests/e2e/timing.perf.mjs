// How long the app waits on the database, page by page, on a big database
// (tests/perf/scale.sql). Signs in as a heavy client, a heavy professional
// and the admin, opens every page they use, and records every request to
// /rest/v1: which table or function, and how long it took.
//
//   E2E_EXTRA_SQL=tests/perf/scale.sql E2E_SPECS=timing.perf.mjs bash tests/e2e/run.sh
//
// Prints the slowest requests and each page's time until it settles.
// Fails when any single request takes longer than LIMIT_MS.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { BASE, OUT, check, finish, sql, iso, daysFromToday } from "./lib.mjs";
import { TEST_PIN } from "./gateway.mjs";

const LIMIT_MS = Number(process.env.PERF_LIMIT_MS || 1000);
const requests = [];
const pages = [];

const region = sql("select id from regions where name = 'Κυκλάδες'");
const boat = sql("select id from boat_types where name = 'Ιστιοπλοϊκό'");
const searchUrl = `/platform/search?roles=skipper&start=${iso(daysFromToday(40))}&end=${iso(daysFromToday(43))}` +
  `&region=${region}&point=${encodeURIComponent("Σύρος")}&arrival=${encodeURIComponent("Σύρος")}&boat=${boat}&party=4&cabin=true`;

async function visit(label, phone, paths, panels = true) {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  let current = "login";
  page.on("requestfinished", (req) => {
    const u = new URL(req.url());
    if (!u.pathname.includes("/rest/v1/")) return;
    const t = req.timing();
    const what = u.pathname.replace(/^.*\/rest\/v1\//, "");
    requests.push({ who: label, page: current, what, ms: Math.round(t.responseEnd - t.requestStart) });
  });
  try {
    if (phone) {
      await page.goto(`${BASE}/platform/login`);
      await page.waitForLoadState("networkidle");
      await page.locator("input").nth(0).fill(phone);
      await page.locator("input").nth(1).fill(TEST_PIN);
      await page.keyboard.press("Enter");
      await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 });
    }
    for (const path of paths) {
      current = path.split("?")[0];
      const t0 = Date.now();
      await page.goto(BASE + path);
      await page.waitForLoadState("networkidle", { timeout: 60000 });
      // Open the first rows: their details load on open.
      const toggles = page.locator("[aria-expanded='false']");
      const n = Math.min(await toggles.count(), 2);
      for (let i = 0; i < n; i++) await toggles.nth(i).click({ timeout: 3000 }).catch(() => {});
      if (n) await page.waitForLoadState("networkidle", { timeout: 60000 });
      pages.push({ who: label, page: current, ms: Date.now() - t0 });
    }
    if (panels) {
      for (const name of [/^Ειδοποιήσεις/, /^Μηνύματα/]) {
        current = `panel ${name.source.slice(1)}`;
        const t0 = Date.now();
        await page.getByRole("button", { name }).first().click({ timeout: 5000 });
        await page.waitForLoadState("networkidle", { timeout: 60000 });
        pages.push({ who: label, page: current, ms: Date.now() - t0 });
        await page.keyboard.press("Escape");
      }
    }
  } catch (e) {
    check(`${label}: η περιήγηση ολοκληρώθηκε`, false, e.message.split("\n")[0]);
  } finally {
    await browser.close();
  }
}

await visit("visitor", null, ["/platform/login", searchUrl], false);
await visit("client", "6900002002", ["/platform", "/platform/bookings", "/platform/requests", "/platform/wallet",
  "/platform/profile", searchUrl]);
await visit("pro", "6900002005", ["/platform", "/platform/requests", "/platform/bookings", "/platform/availability",
  "/platform/wallet", "/platform/profile"]);
const client = sql("select id from users where full_name = 'Μαρία Πελάτη'");
await visit("admin", "6900002001", ["/platform/admin", "/platform/admin/approvals", "/platform/admin/replacements",
  "/platform/admin/offers", "/platform/admin/bookings", "/platform/admin/deliveries", "/platform/admin/users",
  "/platform/admin/finance", "/platform/admin/disputes", "/platform/admin/messages", `/platform/admin/user/${client}`]);

const slow = [...requests].sort((a, b) => b.ms - a.ms);
console.log("\nπιο αργές κλήσεις στη βάση:");
for (const r of slow.slice(0, 25)) console.log(`  ${String(r.ms).padStart(6)} ms  ${r.who.padEnd(7)} ${r.page.padEnd(28)} ${r.what}`);
console.log("\nσελίδες (μέχρι να ηρεμήσει το δίκτυο):");
for (const p of [...pages].sort((a, b) => b.ms - a.ms)) console.log(`  ${String(p.ms).padStart(6)} ms  ${p.who.padEnd(7)} ${p.page}`);
writeFileSync(`${OUT}/timing.json`, JSON.stringify({ requests, pages }, null, 2));

const over = slow.filter((r) => r.ms > LIMIT_MS);
check(`καμία κλήση πάνω από ${LIMIT_MS} ms (${requests.length} κλήσεις)`, over.length === 0,
  over.slice(0, 10).map((r) => `${r.ms}ms ${r.who} ${r.page} ${r.what}`).join("\n     "));
finish();
