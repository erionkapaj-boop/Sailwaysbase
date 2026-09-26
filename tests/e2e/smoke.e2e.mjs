// Every page, as every kind of user: nothing may throw, no request to the
// database may fail, and no page may show the generic error message. This is
// what catches a query left pointing at a column that no longer exists.
// Runs after replacement.e2e.mjs, so the database already holds bookings,
// cancellations, offers, notifications and wallet movements to render.
import { chromium } from "playwright";
import { BASE, check, finish, sql } from "./lib.mjs";
import { TEST_PIN } from "./gateway.mjs";
import { PUBLIC, EVERYONE, PRO_ONLY, adminPages } from "./pages.mjs";

const ADMIN = adminPages();

// Messages the app shows when something it asked the database for failed.
const ERROR_TEXT = /Κάτι πήγε στραβά|Something went wrong|Application error/i;

async function crawl(label, phone, paths) {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  let current = "";
  const problems = [];
  page.on("pageerror", (e) => problems.push(`${current}: page error: ${e.message}`));
  page.on("response", async (r) => {
    const u = r.url();
    if ((u.includes("/rest/v1/") || u.includes("/api/")) && r.status() >= 400) {
      let body = "";
      try { body = (await r.text()).slice(0, 200); } catch {}
      problems.push(`${current}: ${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, "").slice(0, 120)} → ${r.status()} ${body}`);
    }
  });
  try {
    if (phone) {
      current = "login";
      await page.goto(`${BASE}/platform/login`);
      await page.waitForLoadState("networkidle");
      await page.locator("input").nth(0).fill(phone);
      await page.locator("input").nth(1).fill(TEST_PIN);
      await page.keyboard.press("Enter");
      await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 });
    }
    for (const path of paths) {
      current = path;
      await page.goto(BASE + path);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(800);
      const body = await page.innerText("body");
      if (ERROR_TEXT.test(body)) problems.push(`${path}: shows an error message: «${body.match(ERROR_TEXT)[0]}»`);
      // Expand collapsed rows (bookings, requests, cases) — their details load on open.
      const toggles = page.locator("[aria-expanded='false'], button:has-text('⌄'), div[role=button]");
      const n = Math.min(await toggles.count(), 6);
      for (let i = 0; i < n; i++) await toggles.nth(i).click({ timeout: 2000 }).catch(() => {});
      if (n) {
        await page.waitForTimeout(800);
        const after = await page.innerText("body");
        if (ERROR_TEXT.test(after)) problems.push(`${path} (expanded): shows an error message`);
      }
    }
    // The header's panels (menu, notifications, messages) load their data only
    // when opened, so open each one in turn.
    if (phone) {
      current = "header panels";
      await page.goto(`${BASE}/platform`);
      await page.waitForLoadState("networkidle");
      for (const name of [/^Ειδοποιήσεις/, /^Μηνύματα/]) {
        current = `header: ${name.source.slice(1)}`;
        await page.getByRole("button", { name }).first().click({ timeout: 5000 });
        await page.waitForTimeout(1200);
        const body = await page.innerText("body");
        if (ERROR_TEXT.test(body)) problems.push(`${current}: shows an error message`);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
      }
    }
  } catch (e) {
    problems.push(`${current}: crawl stopped: ${e.message.split("\n")[0]}`);
  } finally {
    await browser.close();
  }
  check(`${label}: ${paths.length} σελίδες χωρίς σφάλματα`, problems.length === 0, problems.join("\n     "));
}

await crawl("επισκέπτης", null, PUBLIC);
await crawl("πελάτης", "6900002002", EVERYONE);
await crawl("επαγγελματίας", "6900002005", [...EVERYONE, ...PRO_ONLY]);
await crawl("admin", "6900002001", ADMIN);
finish();
