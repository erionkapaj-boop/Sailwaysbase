import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { TEST_PIN } from "./gateway.mjs";

export const BASE = process.env.APP_URL || "http://localhost:3000";
export const OUT = new URL("./output/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const MONTH_GEN = [
  "Ιανουαρίου", "Φεβρουαρίου", "Μαρτίου", "Απριλίου", "Μαΐου", "Ιουνίου",
  "Ιουλίου", "Αυγούστου", "Σεπτεμβρίου", "Οκτωβρίου", "Νοεμβρίου", "Δεκεμβρίου",
];

// ---- assertions -------------------------------------------------------------
const failures = [];
export function check(label, cond, detail = "") {
  if (cond) console.log(`ok   ${label}`);
  else {
    failures.push(label);
    console.log(`FAIL ${label}${detail ? `\n     ${String(detail).slice(0, 400)}` : ""}`);
  }
}
export function finish() {
  console.log(failures.length ? `\n${failures.length} FAILED` : "\nALL BROWSER TESTS PASSED");
  process.exit(failures.length ? 1 : 0);
}

// ---- database (read-only checks and time-travel setup) ------------------------
export function sql(query) {
  return execFileSync("psql", ["-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", query], { env: process.env })
    .toString()
    .trim();
}
export const num = (query) => Number(sql(query));

// ---- dates -------------------------------------------------------------------
export function daysFromToday(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}
export const iso = (d) => d.toISOString().slice(0, 10);
const dayLabel = (d) => `${d.getDate()} ${MONTH_GEN[d.getMonth()]} ${d.getFullYear()}`;

export async function pickDay(page, date) {
  const target = page.locator(`button.sf-cal-day[aria-label="${dayLabel(date)}"]`);
  for (let i = 0; i < 4 && !(await target.count()); i++) {
    await page.getByRole("button", { name: "Επόμενος μήνας" }).first().click();
    await page.waitForTimeout(250);
  }
  await target.first().click();
}

// ---- browser -----------------------------------------------------------------
// Στο production το React δεν λέει ποιο στοιχείο διαφέρει στην υδάτωση. Σε κάθε σελίδα κρατιέται, μόλις φορτώσει το
// HTML του διακομιστή (πριν την υδάτωση), μια δομική εικόνα του (ετικέτες και κείμενα, χωρίς μορφοποίηση). Όταν
// βγει #418, συγκρίνεται με το DOM εκείνη τη στιγμή και τυπώνεται το ΠΡΩΤΟ σημείο που διαφέρει, με τα γειτονικά του.
export const HYDRATION_SNAP = () => {
  const tok = (root) => {
    const out = [];
    const walk = (n) => {
      if (n.nodeType === 3) {
        const t = n.textContent.replace(/\s+/g, " ").trim();
        if (t) out.push("#" + t.slice(0, 80));
      } else if (n.nodeType === 1) {
        if (["SCRIPT", "STYLE", "NOSCRIPT", "LINK", "META", "TEMPLATE"].includes(n.tagName)) return;
        const id = n.getAttribute("data-sf-step") !== null ? "[step]" : n.id ? `#${n.id}` : "";
        out.push("<" + n.tagName.toLowerCase() + id + ">");
        n.childNodes.forEach(walk);
      }
    };
    walk(root);
    return out;
  };
  // Πού βρίσκεται ένας κόμβος (για να φαίνεται ποιος άλλαξε το DOM πριν την υδάτωση).
  const where = (n) => {
    const parts = [];
    for (let x = n; x && x.nodeType === 1 && parts.length < 6; x = x.parentElement) {
      const cls = typeof x.className === "string" && x.className ? "." + x.className.split(" ")[0] : "";
      const data = [...x.attributes].find((a) => a.name.startsWith("data-"))?.name || "";
      parts.unshift(x.tagName.toLowerCase() + cls + (data ? `[${data}]` : ""));
    }
    return parts.join(">");
  };
  const desc = (n) => (n.nodeType === 3 ? `#${n.textContent.trim().slice(0, 30)}` : n.nodeType === 8 ? `<!--${n.data.slice(0, 10)}-->` : `<${(n.tagName || "?").toLowerCase()}${n.id ? "#" + n.id : ""}>`);
  window.__sfTok = tok;
  window.__sfMut = [];
  window.addEventListener("error", (e) => {
    if (/#418|#423|#425/.test(String(e.message || e.error?.message || ""))) window.__sfErrAt ??= Math.round(performance.now());
  });
  document.addEventListener("DOMContentLoaded", () => {
    window.__sfSsr = tok(document.body);
    new MutationObserver((list) => {
      for (const m of list) {
        if (window.__sfMut.length >= 60 || m.type !== "childList") continue;
        const added = [...m.addedNodes].map(desc).slice(0, 3);
        const removed = [...m.removedNodes].map(desc).slice(0, 3);
        window.__sfMut.push({ t: Math.round(performance.now()), at: where(m.target), added, removed });
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
};

export async function hydrationDiag(page, phone) {
  try {
    const r = await page.evaluate(() => {
      const a = window.__sfSsr;
      if (!a || !window.__sfTok) return null;
      const b = window.__sfTok(document.body);
      let i = 0;
      while (i < a.length && i < b.length && a[i] === b[i]) i++;
      const errAt = window.__sfErrAt ?? Infinity;
      const before = (window.__sfMut || []).filter((m) => m.t <= errAt).slice(-12);
      return { i, la: a.length, lb: b.length, server: a.slice(Math.max(0, i - 3), i + 6), browser: b.slice(Math.max(0, i - 3), i + 6), errAt, before };
    });
    const url = page.url();
    if (!r) return console.log(`   [418-diag ${phone}] ${url}\n     (χωρίς εικόνα του διακομιστή)`);
    console.log(`   [418-diag ${phone}] ${url}\n     πρώτη διαφορά στη θέση ${r.i} (διακομιστής ${r.la} κόμβοι, browser ${r.lb})\n     διακομιστής: ${JSON.stringify(r.server)}\n     browser:     ${JSON.stringify(r.browser)}\n     αλλαγές DOM πριν το σφάλμα (${r.errAt}ms): ${JSON.stringify(r.before)}`);
  } catch (e) {
    console.log(`   [418-diag ${phone}] δεν έγινε: ${String(e.message).slice(0, 80)}`);
  }
}

export async function as(phone, fn) {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  );
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(HYDRATION_SNAP);
  const page = await ctx.newPage();
  const errors = [];
  // Any uncaught error fails the step — including React hydration errors,
  // which is how the <style> escaping bug on the search page was found.
  // Σφάλματα που ένα σενάριο ρίχνει επίτηδες ξεκινούν με "e2e:" και δεν μετράνε.
  page.on("pageerror", (e) => {
    if (!e.message.startsWith("e2e:")) errors.push(`${e.message} @ ${page.url()}`);
    if (/#418|#423|#425/.test(e.message)) hydrationDiag(page, phone).catch(() => {});
  });
  // Στον dev server το React γράφει στο console την ακριβή διαφορά server/client.
  page.on("console", (m) => { if (/hydrat/i.test(m.text())) console.log(`   [${phone}] ${m.text().slice(0, 900)}`); });
  try {
    await page.goto(`${BASE}/platform/login`);
    await page.waitForLoadState("networkidle");
    const inputs = page.locator("input");
    await inputs.nth(0).fill(phone);
    await inputs.nth(1).fill(TEST_PIN);
    await page.keyboard.press("Enter");
    await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 });
    await fn(page);
    check(`χωρίς σφάλματα σελίδας (${phone})`, errors.length === 0, errors.join(" | "));
  } catch (e) {
    await page.screenshot({ path: `${OUT}/failure-${phone}-${Date.now()}.png`, fullPage: true }).catch(() => {});
    check(`η ροή ολοκληρώθηκε (${phone})`, false, e.stack || e.message);
  } finally {
    await browser.close();
  }
}

// Η σκέτη /platform/search συνεχίζει το αίτημα σε εξέλιξη του λογαριασμού
// (0122). Στα τεστ, όποιος την ανοίγει ξεκινά νέα αναζήτηση: τα αιτήματα σε
// εξέλιξη άλλων βημάτων σβήνονται πρώτα (το συνεχίζειν ελέγχεται χωριστά).
export async function go(page, path) {
  if (path === "/platform/search") sql("delete from request_drafts");
  await page.goto(BASE + path);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);
}
export const text = async (page) => (await page.innerText("body")).replace(/\s+/g, " ");
export const click = (page, name) => page.getByRole("button", { name, exact: true }).first().click();

// «Από πού ξεκινά το ταξίδι;»: γράφει και διαλέγει την πρόταση με αυτό το όνομα.
export async function pickPlace(page, typed, name = typed) {
  const box = page.getByRole("combobox").first();
  await box.fill(typed);
  await page.getByRole("option", { name: new RegExp(`^${name}`) }).first().click();
}

// Στιγμιότυπο για τον έλεγχο αισθητικής (docs/DESIGN.md): κινητό και desktop.
export async function shoot(page, name) {
  const original = page.viewportSize();
  for (const [w, h, tag] of [[390, 844, "m"], [1280, 900, "d"]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/design-${name}-${tag}.png`, fullPage: false });
  }
  if (original) await page.setViewportSize(original);
}
