// Ενιαίο header σε ΚΑΘΕ σελίδα: αριστερά οι τελείες (μενού), κέντρο τιμόνι + «SkipperFinder» που πάει στην αρχική
// (εκτός από την ίδια την αρχική, όπου μένει το μεγάλο λογότυπο στη μέση), δεξιά γλώσσα και Σύνδεση/λογαριασμός.
// Όλες οι σελίδες, συνδεδεμένος και μη, κινητό και desktop: χωρίς οριζόντια υπερχείλιση, χαμηλό ύψος, κεντραρισμένο.
import { chromium } from "playwright";
import { BASE, check, finish, sql, shoot } from "./lib.mjs";
import { TEST_PIN } from "./gateway.mjs";
import { PUBLIC, EVERYONE, PRO_ONLY, adminPages } from "./pages.mjs";

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const SIZES = [["κινητό", 390, 844], ["desktop", 1280, 900]];

async function login(page, phone) {
  await page.goto(`${BASE}/platform/login`);
  await page.waitForLoadState("networkidle");
  await page.locator("input").nth(0).fill(phone);
  await page.locator("input").nth(1).fill(TEST_PIN);
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 });
}

async function inspect(page, path, who, label, wantMenu = true) {
  await page.goto(BASE + path);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(900);
  const isHome = path === "/platform";
  const r = await page.evaluate(() => {
    const hs = [...document.querySelectorAll("[data-sf-header]")];
    const h = hs[0];
    const box = h?.getBoundingClientRect();
    const link = document.querySelector("[data-home-link]");
    const lb = link?.getBoundingClientRect();
    const apps = document.querySelector('[aria-label]:is(button)');
    return {
      headers: hs.length,
      height: box ? Math.round(box.height) : 0,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      links: document.querySelectorAll("[data-home-link]").length,
      linkCenter: lb ? Math.round(lb.left + lb.width / 2) : null,
      linkText: link ? link.innerText.trim() : "",
      vw: document.documentElement.clientWidth,
      leftOfHeader: h ? h.querySelector("button, a")?.getBoundingClientRect().left ?? null : null,
    };
  });
  const tag = `${who} ${label} ${path}`;
  const problems = [];
  if (r.overflow > 0) problems.push(`οριζόντια υπερχείλιση ${r.overflow}px`);
  if (isHome) {
    if (r.links !== 0) problems.push("στην αρχική δεν πρέπει να υπάρχει το κέντρο του header");
  } else {
    if (r.headers < 1) problems.push("δεν υπάρχει header");
    if (r.links !== 1) problems.push(`σύνδεσμος αρχικής: ${r.links}`);
    if (r.links === 1 && r.vw >= 480 && !r.linkText.includes("SkipperFinder")) problems.push(`χωρίς όνομα: «${r.linkText}»`);
    if (r.height > 64) problems.push(`ύψος header ${r.height}px`);
    if (r.vw >= 640 && r.linkCenter !== null && Math.abs(r.linkCenter - r.vw / 2) > 40) problems.push(`όχι στο κέντρο (${r.linkCenter} / ${r.vw / 2})`);
    if (r.vw < 640 && r.linkCenter !== null && (r.linkCenter < r.vw * 0.25 || r.linkCenter > r.vw * 0.75)) problems.push(`εκτός μέσου της κεφαλίδας (${r.linkCenter} / ${r.vw})`);
  }
  return { tag, problems, r };
}

for (const [label, w, h] of SIZES) {
  // ---- Χωρίς σύνδεση ----
  {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const bad = [];
    for (const p of ["/platform", ...PUBLIC]) {
      const x = await inspect(page, p, "μη συνδεδεμένος", label);
      if (x.problems.length) bad.push(`${x.tag}: ${x.problems.join("; ")}`);
    }
    check(`μη συνδεδεμένος, ${label}: όλες οι σελίδες με το ίδιο header`, bad.length === 0, bad.join(" | "));
    // Πάτημα στο κέντρο → αρχική.
    await page.goto(`${BASE}/platform/board`);
    await page.waitForTimeout(1200);
    await shoot(page, `header-board-out-${label}`);
    await page.locator("[data-home-link]").click();
    await page.waitForURL((u) => u.pathname === "/platform", { timeout: 8000 }).catch(() => {});
    check(`μη συνδεδεμένος, ${label}: το κέντρο του header πάει στην αρχική`, new URL(page.url()).pathname === "/platform");
    await ctx.close();
  }
  // ---- Πελάτης, επαγγελματίας, admin ----
  for (const [who, phone, pages] of [
    ["πελάτης", "6900002002", EVERYONE],
    ["επαγγελματίας", "6900002003", [...EVERYONE, ...PRO_ONLY]],
    ["admin", "6900002001", ["/platform", "/platform/board", ...adminPages().slice(0, 6)]],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await login(page, phone);
    const bad = [];
    for (const p of pages) {
      const x = await inspect(page, p, who, label);
      if (x.problems.length) bad.push(`${x.tag}: ${x.problems.join("; ")}`);
    }
    check(`${who}, ${label}: όλες οι σελίδες με το ίδιο header`, bad.length === 0, bad.join(" | "));
    if (who === "πελάτης") {
      await page.goto(`${BASE}/platform/board`); await page.waitForTimeout(1200);
      await shoot(page, `header-board-in-${label}`);
      await page.goto(`${BASE}/platform/requests`); await page.waitForTimeout(1200);
      await shoot(page, `header-requests-in-${label}`);
      await page.locator("[data-home-link]").click();
      await page.waitForURL((u) => u.pathname === "/platform", { timeout: 8000 }).catch(() => {});
      check(`πελάτης, ${label}: το κέντρο του header πάει στην αρχική`, new URL(page.url()).pathname === "/platform");
    }
    await ctx.close();
  }
}

// ---- Μέσα στον οδηγό αναζήτησης: το header είναι το ίδιο (τελείες, τιμόνι + SkipperFinder → αρχική) ----
for (const [label, w, h] of SIZES) {
  for (const [who, phone] of [["μη συνδεδεμένος", null], ["πελάτης", "6900002002"]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    if (phone) await login(page, phone);
    await page.goto(`${BASE}/platform`);
    await page.waitForTimeout(1500);
    check(`${who}, ${label}: στην αρχική δεν υπάρχει το κέντρο του header (μεγάλο λογότυπο)`, (await page.locator("[data-home-link]").count()) === 0);
    await page.locator("[data-home-search]").click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Ελλάδα", exact: true }).click();
    await page.waitForTimeout(1800);
    check(`${who}, ${label}: μέσα στον οδηγό το header έχει τιμόνι + SkipperFinder`, (await page.locator("[data-home-link]").count()) === 1);
    const apps = page.getByRole("button", { name: "Περισσότερα", exact: true });
    check(`${who}, ${label}: οι τελείες υπάρχουν μέσα στον οδηγό`, (await apps.count()) >= 1);
    // το header μένει ορατό όταν η σελίδα κυλά
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(500);
    const top = await page.locator("[data-home-link]").evaluate((el) => el.getBoundingClientRect().top);
    check(`${who}, ${label}: το header μένει στη θέση του όταν κυλάει η σελίδα`, top >= 0 && top < 70, String(top));
    await shoot(page, `header-flow-${who === "πελάτης" ? "in" : "out"}-${label}`);
    await page.locator("[data-home-link]").click();
    await page.waitForTimeout(1200);
    const onHome = (await page.locator("[data-sf-wizard]").count()) === 0 && (await page.locator("[data-home-search]").count()) === 1;
    check(`${who}, ${label}: το τιμόνι πάει στην αρχική από μέσα από τον οδηγό`, onHome && !page.url().includes("flow="), page.url());
    check(`${who}, ${label}: στην αρχική φαίνεται «Συνέχισε το αίτημά σου» και το μεγάλο λογότυπο`, (await page.locator("[data-resume-request]").count()) === 1 && (await page.locator("[data-home-link]").count()) === 0);
    await ctx.close();
  }
}
await browser.close();
finish();
