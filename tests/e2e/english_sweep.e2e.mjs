// Σάρωση των αγγλικών (docs/I18N.md): κάθε σελίδα, στα αγγλικά, δεν πρέπει να δείχνει
// ελληνικά γράμματα, εκτός από ό,τι είναι δεδομένο (ονόματα ανθρώπων και τόπων,
// ό,τι έγραψε ο χρήστης, η επωνυμία της εταιρείας στο υποσέλιδο) και τα νομικά
// κείμενα (Όροι, Απόρρητο), που περιμένουν δικό τους αγγλικό κείμενο.
// Με SWEEP_SHOTS=1 βγάζει και στιγμιότυπα 390px/1280px για τον έλεγχο σχεδίου.
import { chromium } from "playwright";
import { BASE, as, check, finish, OUT, sql } from "./lib.mjs";

const GREEK = /[Ͱ-Ͽἀ-῿]/;
const SHOTS = process.env.SWEEP_SHOTS === "1";
const ADMIN = "6900002001", MARIA = "6900002002", NIKOS = "6900002003";

const GUEST = ["/platform", "/platform/login", "/platform/register", "/platform/forgot-pin", "/platform/about", "/platform/contact", "/platform/professionals"];
const CLIENT = ["/platform", "/platform/search", "/platform/requests", "/platform/wallet", "/platform/wallet/buy", "/platform/profile", "/platform/bookings", "/platform/delivery", "/platform/delivery/requests"];
const PRO = ["/platform", "/platform/profile", "/platform/availability", "/platform/bookings", "/platform/wallet"];
const ADMINP = ["/platform/admin", "/platform/admin/approvals", "/platform/admin/messages", "/platform/admin/disputes", "/platform/admin/replacements", "/platform/admin/offers", "/platform/admin/bookings", "/platform/admin/deliveries", "/platform/admin/users", "/platform/admin/finance", "/platform/admin/settings", "/platform/admin/health", "/platform/admin/ghost"];

const slug = (p) => p.replace(/^\/platform\/?/, "").replace(/\//g, "-") || "home";

async function sweep(page, who, paths) {
  await page.context().addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
  for (const path of paths) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);
    const lang = await page.evaluate(() => document.documentElement.lang);
    const lines = await page.evaluate(() => {
      const root = document.querySelector("div.platform-scope") || document.body;
      const clone = root.cloneNode(true);
      clone.querySelectorAll("footer, [data-legal], [lang=el], [data-user-text]").forEach((n) => n.remove());
      return clone.innerText.split("\n").map((s) => s.trim()).filter(Boolean);
    });
    const greek = lines.filter((l) => GREEK.test(l));
    check(`${who} ${path}: αγγλικά, χωρίς ελληνικά γράμματα`, lang === "en" && greek.length === 0, `lang=${lang} · ${greek.slice(0, 8).join(" | ")}`);
    if (SHOTS) {
      for (const [w, h, tag] of [[390, 844, "m"], [1280, 900, "d"]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(250);
        await page.screenshot({ path: `${OUT}/en-${who}-${slug(path)}-${tag}.png`, fullPage: true });
      }
    }
  }
}

// Η γλώσσα που διάλεξε ο χρήστης αποθηκεύεται στον λογαριασμό του (users.locale).
// Τα υπόλοιπα τεστ περιμένουν ελληνικά, άρα την επαναφέρουμε όταν τελειώσουμε.
const resetLocales = () => sql("select set_config('platform.trusted', 'true', false); update users set locale = 'el' where locale <> 'el';");
resetLocales();

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await sweep(page, "guest", GUEST);
await browser.close();

try {
  await as(MARIA, (p) => sweep(p, "client", CLIENT));
  await as(NIKOS, (p) => sweep(p, "pro", PRO));
  await as(ADMIN, (p) => sweep(p, "admin", ADMINP));
} finally {
  resetLocales();
}
finish();
