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

const GUEST = ["/platform", "/platform/login", "/platform/register", "/platform/forgot-pin", "/platform/about", "/platform/contact", "/platform/board"];
const CLIENT = ["/platform", "/platform/search", "/platform/requests", "/platform/wallet", "/platform/wallet/buy", "/platform/profile", "/platform/roles", "/platform/settings", "/platform/help", "/platform/bookings", "/platform/delivery", "/platform/delivery/requests", "/platform/board", "/platform/board/new"];
const PRO = ["/platform", "/platform/profile", "/platform/availability", "/platform/bookings", "/platform/wallet"];
const ADMINP = ["/platform/admin", "/platform/admin/approvals", "/platform/admin/messages", "/platform/admin/disputes", "/platform/admin/replacements", "/platform/admin/offers", "/platform/admin/board", "/platform/admin/community", "/platform/admin/map", "/platform/admin/bookings", "/platform/admin/deliveries", "/platform/admin/users", "/platform/admin/finance", "/platform/admin/settings", "/platform/admin/health"];

const slug = (p) => p.replace(/^\/platform\/?/, "").replace(/\//g, "-") || "home";

async function sweep(page, who, paths) {
  // Σφάλματα υδάτωσης (server ≠ client) φαίνονται στο console του dev server με την ακριβή διαφορά.
  page.on("console", (m) => { if (/hydrat/i.test(m.text())) console.log(`   [${who}] ${m.text().slice(0, 700)}`); });
  await page.context().addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
  for (const path of paths) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);
    const lang = await page.evaluate(() => document.documentElement.lang);
    // Ό,τι φαίνεται στη σελίδα (όχι style/script/υποσέλιδο), ανά κομμάτι κειμένου.
    const nodes = await page.evaluate(() => {
      const root = document.querySelector("div.platform-scope") || document.body;
      const out = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || el.closest("style, script, noscript, footer, [data-legal], [lang=el], [data-user-text]")) continue;
        if (!el.getClientRects().length || getComputedStyle(el).visibility === "hidden") continue;
        const t = n.nodeValue.trim();
        if (t) out.push(t);
      }
      return out;
    });
    // Κανένα ελληνικό γράμμα: ούτε στα δεδομένα (τόποι, ονόματα, τύποι σκαφών, γλώσσες…),
    // που περνούν από το lib/platform/localData.js. Μόνο ό,τι έγραψε ο ίδιος ο χρήστης
    // (μηνύματα, σημειώσεις) σημαίνεται με data-user-text και μένει όπως γράφτηκε.
    const greek = [...new Set(nodes.filter((l) => GREEK.test(l)))];
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
  await as(MARIA, async (p) => {
    await sweep(p, "client", CLIENT);
    // Τα ονόματα στα αγγλικά φαίνονται με λατινικά γράμματα (full_name_latin της βάσης).
    const latin = sql("select full_name_latin from users where id = 'a0000000-0000-0000-0000-000000000002'");
    await p.goto(`${BASE}/platform`);
    await p.waitForLoadState("networkidle");
    await p.waitForTimeout(1200);
    // Το όνομα φαίνεται στο μενού προφίλ (πάνω δεξιά).
    await p.locator("[data-profile-menu]").click();
    await p.locator("[data-profile-pop]").waitFor();
    check(`το όνομα της πελάτισσας φαίνεται λατινικά («${latin}») και όχι ελληνικά`, (await p.innerText("body")).includes(latin.split(" ")[0]) && !(await p.innerText("body")).includes("Μαρία"));
  });
  await as(NIKOS, (p) => sweep(p, "pro", PRO));
  await as(ADMIN, (p) => sweep(p, "admin", ADMINP));
} finally {
  resetLocales();
}
finish();
