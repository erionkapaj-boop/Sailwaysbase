// Every page on a phone (390×844, touch), as every kind of visitor.
//   - Nothing may stick out sideways: a page wider than the screen means
//     sideways scrolling and cut-off text — a failure.
//   - Every button, link and field must be big enough for a finger: at least
//     24×24 CSS px (WCAG 2.2 AA). Links inside running text are exempt.
// Screenshots of every page land in tests/e2e/output/mobile/ for a human look.
// Runs after replacement.e2e.mjs, so pages have bookings and offers to show.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { BASE, OUT, check, finish } from "./lib.mjs";
import { TEST_PIN } from "./gateway.mjs";
import { PUBLIC, EVERYONE, PRO_ONLY, adminPages } from "./pages.mjs";

const SHOTS = `${OUT}/mobile`;
mkdirSync(SHOTS, { recursive: true });
const MIN_TARGET = 24;
const report = [];

// Runs inside the page.
function inspect(minTarget) {
  const vw = document.documentElement.clientWidth;
  const describe = (el) => {
    const label = (el.getAttribute("aria-label") || el.innerText || el.value || el.placeholder || "").trim().replace(/\s+/g, " ");
    return `<${el.tagName.toLowerCase()}> ${label.slice(0, 40) || "(χωρίς κείμενο)"}`;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
  };

  // What sticks out: the outermost elements whose right edge passes the screen.
  const wide = [];
  if (document.documentElement.scrollWidth > vw + 1) {
    for (const el of document.body.querySelectorAll("*")) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && !(el.parentElement && el.parentElement.getBoundingClientRect().right > vw + 1)) {
        wide.push(`${describe(el)} (έως ${Math.round(r.right)}px)`);
      }
    }
  }

  // What a card or box silently cuts off: sideways page scrolling can't see
  // it, because the box hides whatever doesn't fit.
  const clipped = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (el.childElementCount || !visible(el) || !(el.innerText || "").trim() && el.tagName !== "svg") continue;
    const r = el.getBoundingClientRect();
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const st = getComputedStyle(a);
      if (st.overflowX === "auto" || st.overflowX === "scroll") break;  // scrolls on purpose
      if (st.overflowX === "hidden" || st.overflowX === "clip" || st.overflow === "hidden") {
        const b = a.getBoundingClientRect();
        if (r.right > b.right + 1 || r.left < b.left - 1) clipped.push(`${describe(el)} (κόβεται)`);
        break;
      }
    }
  }
  if (clipped.length) wide.push(...[...new Set(clipped)].slice(0, 6));

  const small = [];
  for (const el of document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=button]")) {
    if (!visible(el) || el.disabled || el.closest("[aria-hidden=true]")) continue;
    // A link in a sentence is sized by the sentence (WCAG's inline exception).
    if (el.tagName === "A" && getComputedStyle(el).display === "inline" && el.parentElement?.closest("p, li, label, span")) continue;
    const r = el.getBoundingClientRect();
    const target = el.type === "checkbox" || el.type === "radio" ? el.closest("label")?.getBoundingClientRect() || r : r;
    if (target.width < minTarget || target.height < minTarget) {
      small.push(`${describe(el)} ${Math.round(target.width)}×${Math.round(target.height)}`);
    }
  }
  return { scrollWidth: document.documentElement.scrollWidth, vw, wide: wide.slice(0, 6), small: [...new Set(small)].slice(0, 12) };
}

async function survey(label, phone, paths) {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const overflow = [];
  const small = [];
  const look = async (name) => {
    const r = await page.evaluate(inspect, MIN_TARGET);
    if (r.wide.length) overflow.push(`${name}: ${r.wide.join("; ")}`);
    if (r.small.length) small.push(`${name}: ${r.small.join("; ")}`);
    report.push({ who: label, page: name, ...r });
  };
  try {
    if (phone) {
      await page.goto(`${BASE}/platform/login`);
      await page.waitForLoadState("networkidle");
      await page.locator("input").nth(0).fill(phone);
      await page.locator("input").nth(1).fill(TEST_PIN);
      await page.keyboard.press("Enter");
      await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 });
    }
    for (const path of paths) {
      await page.goto(BASE + path);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(600);
      // Open collapsed rows: expanded bookings and cases are where tables and
      // long lines live.
      const toggles = page.locator("[aria-expanded='false']");
      const n = Math.min(await toggles.count(), 3);
      for (let i = 0; i < n; i++) await toggles.nth(i).click({ timeout: 2000 }).catch(() => {});
      if (n) await page.waitForTimeout(700);
      await look(path);
      const file = `${label}${path.replace(/\/platform/, "").replace(/[^a-z0-9]+/gi, "_") || "_home"}`.slice(0, 80);
      await page.screenshot({ path: `${SHOTS}/${file}.png`, fullPage: true });
    }
    if (phone) {
      await page.goto(`${BASE}/platform`);
      await page.waitForLoadState("networkidle");
      for (const name of [/^Ειδοποιήσεις/, /^Μηνύματα/]) {
        await page.getByRole("button", { name }).first().click({ timeout: 5000 });
        await page.waitForTimeout(900);
        await look(`panel ${name.source.slice(1)}`);
        await page.screenshot({ path: `${SHOTS}/${label}_panel_${name.source.slice(1)}.png` });
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
      }
    }
  } catch (e) {
    overflow.push(`η περιήγηση σταμάτησε: ${e.message.split("\n")[0]}`);
  } finally {
    await browser.close();
  }
  check(`${label}: τίποτα δεν βγαίνει έξω από την οθόνη του κινητού`, overflow.length === 0, overflow.join("\n     "));
  check(`${label}: κουμπιά και πεδία αρκετά μεγάλα για δάχτυλο (≥${MIN_TARGET}px)`, small.length === 0, small.join("\n     "));
}

await survey("visitor", null, PUBLIC);
await survey("client", "6900002002", EVERYONE);
await survey("pro", "6900002005", [...EVERYONE, ...PRO_ONLY]);
await survey("admin", "6900002001", adminPages());
writeFileSync(`${SHOTS}/report.json`, JSON.stringify(report, null, 2));
finish();
