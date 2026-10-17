// Πάνω μπάρα παντού + πρόσβαση στις εφαρμογές χωρίς σύνδεση (εντολή ιδιοκτήτη 17/10/2026).
// 1. Συνδεδεμένος: τελείες (launcher), τιμόνι + SkipperFinder στο κέντρο, γλώσσα/λογαριασμός — ορατά και ΜΗ καλυμμένα σε κάθε σελίδα
//    και κατάσταση (και στον χάρτη Nearby σε κινητό), κινητό και υπολογιστής.
// 2. Επισκέπτης: το ίδιο header, ο launcher ανοίγει και οι έξι εφαρμογές (Jobs, Delivery, WindNow, Nearby, Explore, Community)
//    ανοίγουν και φαίνονται χωρίς κανένα αίτημα σύνδεσης και χωρίς κρυμμένα στοιχεία.
import { chromium } from "playwright";
import { BASE, check, finish, shoot } from "./lib.mjs";
import { TEST_PIN } from "./gateway.mjs";
import { PUBLIC, EVERYONE, PRO_ONLY, adminPages } from "./pages.mjs";

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const SIZES = [["κινητό", 390, 844], ["desktop", 1280, 900]];
const APPS = ["/platform/board", "/platform/board?map=1", "/platform/board/new", "/platform/delivery", "/platform/delivery/requests", "/platform/windnow", "/platform/explore", "/platform/community"];
const APP_KEYS = ["jobs", "delivery", "windnow", "community", "nearby", "explore"];

async function login(page, phone) {
  await page.goto(`${BASE}/platform/login`);
  await page.waitForLoadState("networkidle");
  await page.locator("input").nth(0).fill(phone);
  await page.locator("input").nth(1).fill(TEST_PIN);
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 });
}

// Η μπάρα είναι ορατή και δεν την καλύπτει τίποτα (το στοιχείο που βρίσκεται πάνω σε κάθε κομμάτι της είναι το ίδιο το κομμάτι).
async function bar(page, { who, home }) {
  return page.evaluate(({ who, home }) => {
    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.bottom <= 0 || r.top >= window.innerHeight) return false;
      const top = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 1), window.innerWidth - 1), Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 1));
      return Boolean(top && (el === top || el.contains(top) || top.contains(el)));
    };
    const byLabel = (re) => [...document.querySelectorAll("button[aria-label]")].find((b) => re.test(b.getAttribute("aria-label")));
    const dots = byLabel(/^(Περισσότερα|More)$/);
    const brand = document.querySelector("[data-home-link]");
    const lang = document.querySelector("[data-language-button]");
    const login = document.querySelector('a[href="/platform/login"]');
    const menu = byLabel(/^(Μενού|Menu)$/);
    const back = document.querySelector("[data-header-back], [data-header-slot] > *");
    const out = { dots: visible(dots), lang: visible(lang), brandText: brand ? brand.innerText.trim().length > 0 && visible(brand) : false };
    out.brand = home ? true : visible(brand);
    out.account = who === "guest" ? visible(login) : visible(document.querySelector("[data-profile-menu]"));
    out.hasBack = Boolean(back);
    out.vw = window.innerWidth;
    out.overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    return out;
  }, { who, home });
}

function verdict(r, { home }) {
  const p = [];
  if (!r.dots) p.push("τελείες");
  if (!r.brand) p.push("τιμόνι/SkipperFinder");
  if (!r.lang) p.push("γλώσσα");
  if (!r.account) p.push("λογαριασμός/Σύνδεση");
  if (r.overflow > 0) p.push(`υπερχείλιση ${r.overflow}px`);
  // Το όνομα φαίνεται, εκτός από κινητό με βέλος «Πίσω» στην ίδια μπάρα (δεν χωρά)· στην αρχική υπάρχει το μεγάλο λογότυπο.
  if (!home && !r.brandText && !(r.vw <= 480 && r.hasBack)) p.push("όνομα SkipperFinder");
  return p;
}

for (const [label, w, h] of SIZES) {
  for (const [who, phone, pages] of [
    ["guest", null, ["/platform", ...PUBLIC, ...APPS]],
    ["client", "6900002002", ["/platform", ...EVERYONE, ...APPS]],
    ["pro", "6900002003", ["/platform", ...EVERYONE, ...PRO_ONLY, ...APPS]],
    ["admin", "6900002001", ["/platform", "/platform/board", "/platform/community", ...adminPages().slice(0, 4)]],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    if (phone) await login(page, phone);
    const bad = [];
    for (const path of pages) {
      await page.goto(BASE + path);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(900);
      const home = path === "/platform";
      const r = await bar(page, { who, home });
      const problems = verdict(r, { home });
      if (problems.length) bad.push(`${path}: ${problems.join(", ")}`);
    }
    check(`${who}, ${label}: η πάνω μπάρα ορατή και ακάλυπτη σε ${pages.length} σελίδες`, bad.length === 0, bad.join(" | "));

    // Ο launcher ανοίγει από οπουδήποτε: έξι εφαρμογές.
    await page.goto(BASE + "/platform/terms");
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: /^(Περισσότερα|More)$/ }).click();
    await page.waitForSelector("[data-apps-grid]");
    check(`${who}, ${label}: οι τελείες ανοίγουν τον launcher με τις έξι εφαρμογές`, (await page.locator("[data-apps-grid] [data-app]").count()) === 6 && (await page.locator("[data-apps-grid] [data-app]").evaluateAll((els) => els.map((e) => e.dataset.app).join())) === APP_KEYS.join());
    await page.keyboard.press("Escape");

    if (who === "client") {
      for (const [name, path] of [["requests", "/platform/requests"], ["buy", "/platform/wallet/buy"], ["nearby", "/platform/board?map=1"]]) {
        await page.goto(BASE + path);
        await page.waitForTimeout(1200);
        await shoot(page, `header-apps-${name}-${label === "κινητό" ? "mob" : "desk"}`);
      }
    }
    if (who === "guest") {
      // Καμία εφαρμογή δεν ζητά σύνδεση ή κρύβει στοιχεία.
      const walls = [];
      for (const path of APPS) {
        await page.goto(BASE + path);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(900);
        const walled = await page.evaluate(() => ({
          notice: document.querySelectorAll("[data-signed-out-notice]").length,
          loginLinks: [...document.querySelectorAll('a[href*="/platform/login"], a[href*="/platform/register"]')].filter((a) => !a.closest("[data-sf-header]") && !a.closest("header") && !a.closest("nav") && !a.closest("footer")).length,
          h1: document.querySelector("h1")?.innerText || "",
        }));
        if (walled.notice || walled.loginLinks) walls.push(`${path}: notice=${walled.notice} links=${walled.loginLinks}`);
      }
      check(`guest, ${label}: οι εφαρμογές ανοίγουν χωρίς αίτημα σύνδεσης (${APPS.length} σελίδες)`, walls.length === 0, walls.join(" | "));

      // Community: όλα τα στοιχεία εμφανίζονται, οι εγγραφές δίνουν ουδέτερο μήνυμα (όχι αίτημα σύνδεσης).
      await page.goto(BASE + "/platform/community");
      await page.waitForSelector("[data-community-map]");
      check(`guest, ${label}: Community: χάρτης, φίλτρα και «Προσθήκη» ορατά`, (await page.locator("[data-filter]").count()) === 6 && (await page.locator("[data-community-add]").count()) === 1);
      await shoot(page, `community-guest-${label === "κινητό" ? "m" : "d"}`);
      await page.locator("[data-community-add]").click();
      await page.locator("[data-map-frame]").click({ position: { x: 200, y: 200 } });
      await page.locator("[data-place-next]").click();
      await page.locator('[data-form-category="hazard"]').click();
      await page.locator("[data-form-title]").fill("Δοκιμή χωρίς λογαριασμό");
      await page.locator("[data-form-next]").click();
      await page.locator("[data-form-save]").click();
      await page.waitForTimeout(800);
      const msg = await page.locator('[role="alert"]').first().innerText().catch(() => "");
      check(`guest, ${label}: Community: η αποθήκευση δίνει ουδέτερο μήνυμα, όχι αίτημα σύνδεσης`, msg.length > 0 && !/login|σύνδεσ/i.test(msg), msg);
      await page.keyboard.press("Escape");
      await page.goto(BASE + "/platform/community");
      await page.locator('[data-community-tab="groups"]').click();
      await page.waitForSelector("[data-community-groups]");
      check(`guest, ${label}: Community: οι τέσσερις ομάδες και ο κανονισμός ορατά`, (await page.locator("[data-group-open]").count()) === 4 && (await page.locator("[data-community-rules]").count()) === 1);
    }
    await ctx.close();
  }
}
await browser.close();
finish();
