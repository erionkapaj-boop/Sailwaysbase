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
export async function as(phone, fn) {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  );
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  // Any uncaught error fails the step — including React hydration errors,
  // which is how the <style> escaping bug on the search page was found.
  page.on("pageerror", (e) => errors.push(e.message));
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

export async function go(page, path) {
  await page.goto(BASE + path);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);
}
export const text = async (page) => (await page.innerText("body")).replace(/\s+/g, " ");
export const click = (page, name) => page.getByRole("button", { name, exact: true }).first().click();
