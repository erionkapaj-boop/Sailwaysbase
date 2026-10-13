// Ελληνικά γράμματα σε αγγλική σελίδα, και στις καταστάσεις που δεν είναι σελίδες:
// πάνελ της κεφαλίδας, μενού γλώσσας και λογαριασμού, σφάλματα φόρμας, παράθυρα,
// καρτέλες, επιλογές. Το tests/e2e/english_sweep.e2e.mjs ελέγχει τις σελίδες.
// Ό,τι δεν βρεθεί (άλλη διάταξη) αναφέρεται ως SKIP και δεν αποτυγχάνει.
import { chromium } from "playwright";
import { BASE, as, check, finish, sql } from "./lib.mjs";

const GREEK = /[Ͱ-Ͽἀ-῿]/;
const ADMIN = "6900002001", MARIA = "6900002002", NIKOS = "6900002003";

async function greekNow(page) {
  return page.evaluate(() => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || el.closest("style, script, noscript, footer, [data-legal], [lang=el], [data-user-text]")) continue;
      if (!el.getClientRects().length || getComputedStyle(el).visibility === "hidden") continue;
      const t = n.nodeValue.trim();
      if (t) out.push(t);
    }
    // Ετικέτες που δεν είναι κείμενο: aria-label, title, placeholder, alt, και οι επιλογές των select.
    for (const el of document.querySelectorAll("[aria-label], [title], [placeholder], img[alt], option")) {
      if (el.closest("footer, [data-legal], [lang=el], [data-user-text]")) continue;
      for (const a of ["aria-label", "title", "placeholder", "alt"]) if (el.getAttribute(a)) out.push(el.getAttribute(a));
      if (el.tagName === "OPTION") out.push(el.textContent.trim());
    }
    return out;
  }).then((all) => [...new Set(all.filter((l) => GREEK.test(l)))]);
}

async function scan(page, label) {
  await page.waitForTimeout(500);
  const greek = await greekNow(page);
  check(`${label}: χωρίς ελληνικά γράμματα`, greek.length === 0, greek.slice(0, 8).join(" | "));
}

async function step(page, label, fn) {
  try {
    await fn();
    await scan(page, label);
  } catch (e) {
    console.log(`SKIP ${label}: ${String(e.message).split("\n")[0].slice(0, 120)}`);
  }
}

const resetLocales = () => sql("select set_config('platform.trusted', 'true', false); update users set locale = 'el' where locale <> 'el';");
const open = async (page, path) => {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
};
const clickIf = async (page, locator, timeout = 2500) => {
  const el = locator.first();
  await el.waitFor({ state: "visible", timeout });
  await el.click();
  await page.waitForTimeout(700);
};

async function headerPanels(page, who, path = "/platform") {
  await open(page, path);
  for (const name of ["Notifications", "Messages"]) {
    await step(page, `${who}: πάνελ «${name}»`, async () => {
      await clickIf(page, page.getByRole("button", { name: new RegExp(`^${name}`) }));
    });
    await page.keyboard.press("Escape");
    await page.mouse.click(5, 5);
  }
  await step(page, `${who}: μενού γλώσσας`, async () => {
    await clickIf(page, page.locator("[data-language-button]"));
  });
  await page.keyboard.press("Escape");
}

async function viewports(page, who, fn) {
  for (const [w, h, tag] of [[1280, 900, "desktop"], [390, 844, "mobile"]]) {
    await page.setViewportSize({ width: w, height: h });
    await fn(`${who} ${tag}`);
  }
}

resetLocales();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  // ---- επισκέπτης ----------------------------------------------------------
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
  const g = await ctx.newPage();
  await viewports(g, "guest", async (who) => {
    await headerPanels(g, who, "/platform/login");
    await open(g, "/platform/login");
    await step(g, `${who}: λάθος κωδικός στη σύνδεση`, async () => {
      const inputs = g.locator("input");
      await inputs.nth(0).fill("6900009999");
      await inputs.nth(1).fill("000000");
      await g.keyboard.press("Enter");
      await g.waitForTimeout(2500);
    });
    await open(g, "/platform/contact");
    await step(g, `${who}: φόρμα επικοινωνίας, κενή υποβολή`, async () => {
      await clickIf(g, g.locator("button[type=submit]"));
    });
    await open(g, "/platform/forgot-pin");
    await step(g, `${who}: ξέχασα τον κωδικό, κενή υποβολή`, async () => {
      await clickIf(g, g.locator("button[type=submit]"));
    });
    await open(g, "/platform/register");
    await step(g, `${who}: εγγραφή, πρώτο βήμα`, async () => {
      await clickIf(g, g.getByRole("button").filter({ hasText: /continue|next|create/i }));
    });
    await open(g, "/platform");
    for (let i = 1; i <= 4; i++) {
      await step(g, `${who}: αρχική, βήμα ${i} της αναζήτησης`, async () => {
        const main = g.locator("[data-sf-wizard] button, main button, .sf-home button");
        await clickIf(g, main.filter({ hasNotText: /login/i }));
      });
    }
  });
  await ctx.close();

  // ---- ρόλοι ----------------------------------------------------------------
  for (const [phone, who, pages] of [
    [MARIA, "client", ["/platform", "/platform/wallet", "/platform/profile", "/platform/bookings", "/platform/requests", "/platform/delivery"]],
    [NIKOS, "pro", ["/platform", "/platform/availability", "/platform/profile", "/platform/bookings"]],
  ]) {
    await as(phone, async (p) => {
      await p.context().addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
      await viewports(p, who, async (tag) => {
        await headerPanels(p, tag);
        for (const path of pages) {
          await open(p, path);
          await step(p, `${tag}: ${path}`, async () => {});
          await step(p, `${tag}: ${path}, μενού`, async () => {
            await clickIf(p, p.getByRole("button", { name: /^Menu$/i }), 1200);
          });
          await p.keyboard.press("Escape");
        }
      });
    });
  }

  await as(ADMIN, async (p) => {
    await p.context().addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
    await viewports(p, "admin", async (tag) => {
      await headerPanels(p, tag, "/platform/admin");
      const uid = "a0000000-0000-0000-0000-000000000002"; // η δοκιμαστική πελάτισσα
      if (uid) {
        for (const tab of ["Overview", "Profile", "Bookings", "Availability", "Finance", "Actions", "History"]) {
          await open(p, `/platform/admin/user/${uid}`);
          await step(p, `${tag}: καρτέλα χρήστη «${tab}»`, async () => {
            await clickIf(p, p.getByRole("button", { name: new RegExp(`^${tab}`) }), 1500);
          });
        }
      }
      await open(p, "/platform/admin/users");
      await step(p, `${tag}: χρήστες, φίλτρο «Professionals»`, async () => {
        await clickIf(p, p.getByRole("button", { name: /^Professionals/ }));
      });
      await step(p, `${tag}: χρήστες, φίλτρο «All»`, async () => {
        await clickIf(p, p.getByRole("button", { name: /^All/ }));
      });
    });
  });
} finally {
  await browser.close();
  resetLocales();
}
finish();
