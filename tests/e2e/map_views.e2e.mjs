// Ο χάρτης μέσα στην εφαρμογή (docs/MAP_PLAN.md): ανοιχτά αιτήματα με λίστα και
// χάρτη (μεγάλη οθόνη) ή κουμπί «Χάρτης» (κινητό), «Αναζήτηση σε αυτή την
// περιοχή», διαδρομές μεταφορών, ο χάρτης «Πού» στη φόρμα μεταφοράς και η
// επιλογή λιμανιού με πάτημα στον χάρτη της αναζήτησης. Απλό υπόβαθρο (χωρίς δίκτυο).
import { chromium } from "playwright";
import { BASE, as, go, text, check, finish, sql, num, pickPlace, shoot, hydrationOnly } from "./lib.mjs";

const CLIENT = "a0000000-0000-0000-0000-000000000002";
const trusted = (q) => sql(`select set_config('platform.trusted','true',false); ${q}`);
const t0 = sql(`select now()`);
const norm = (x) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Τρία αιτήματα πληρώματος σε γνωστά λιμάνια και μία ανοιχτή μεταφορά.
trusted(`
insert into booking_requests (client_id, origin, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role, party_size, fee_amount, fee_paid_at, expires_at, board_open, board_posted_at)
select '${CLIENT}', 'client', current_date + x.d, current_date + x.d + 5, r.id, x.p, x.p, b.id, 'skipper', 4, 1, now(), now() + interval '9 days', true, now()
from (values (20, 'Λαύριο', 'Σαρωνικός'), (21, 'Νάουσα (Πάρος)', 'Κυκλάδες'), (22, 'Κέρκυρα', 'Ιόνιο')) as x(d, p, reg)
join regions r on r.name = x.reg cross join boat_types b where b.name = 'Ιστιοπλοϊκό';
with d as (
  insert into delivery_requests (client_id, origin_point, destination_point, distance_miles, date_mode, departure_date)
  values ('${CLIENT}', 'Λαύριο', 'Ρόδος', 215, 'fixed', current_date + 25) returning id)
insert into delivery_role_requests (delivery_request_id, crew_role, offered_price, commission_base, platform_commission, client_fee, professional_fee, fee_paid_at, expires_at, board_open)
select id, 'skipper', 1800, 0, 0, 1, 1, now(), now() + interval '20 days', true from d;`);
const seeded = num(`select count(*) from booking_requests where board_open and created_at >= '${t0}'`);
check("δεδομένα δοκιμής: 3 αιτήματα πληρώματος", seeded === 3, seeded);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
const watch = (page) => page.on("pageerror", (e) => hydrationOnly(e, page) || errors.push(`${e.message} @ ${page.url()}`));

console.log("\n== 1. Μεγάλη οθόνη: λίστα και χάρτης δίπλα-δίπλα");
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  watch(page);
  await go(page, "/platform/board");
  await page.waitForSelector('[data-board-map] [data-map-ready="true"]', { timeout: 30000 });
  await page.waitForTimeout(800);
  const pins = await page.locator("[data-map-pin]").count();
  check("ο χάρτης φαίνεται δίπλα στη λίστα, με ετικέτες ημερομηνίας", pins >= 3, pins);
  check("χωρίς κουμπί «Χάρτης» στη μεγάλη οθόνη", (await page.locator("[data-board-map-open]").count()) === 0);
  const lavrioId = sql(`select id from booking_requests where departure_point = 'Λαύριο' and created_at >= '${t0}'`);
  await page.locator(`[data-board-item="${lavrioId}"]`).hover();
  await page.waitForTimeout(300);
  check("πέρασμα πάνω από την κάρτα → η ετικέτα της φωτίζεται", (await page.getAttribute(`[data-map-pin="${lavrioId}"]`, "data-active")) === "true");
  await page.mouse.move(5, 5);
  const kerkyraId = sql(`select id from booking_requests where departure_point = 'Κέρκυρα' and created_at >= '${t0}'`);
  await page.locator(`[data-map-pin="${kerkyraId}"]`).click();
  await page.waitForTimeout(800);
  check("πάτημα στην ετικέτα → η κάρτα της φωτίζεται", (await page.getAttribute(`[data-board-item="${kerkyraId}"]`, "data-hot")) === "true");
  await shoot(page, "map-board");

  // Ο χρήστης μετακινεί τον χάρτη προς το Ιόνιο και ζητά «αναζήτηση σε αυτή την περιοχή».
  const frame = await page.locator("[data-board-map] [data-map-frame]").boundingBox();
  const corfu = await page.evaluate(() => {
    const el = document.querySelector("[data-board-map] [role=region]");
    const p = el.__map.project([19.92, 39.62]);
    const r = el.getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  });
  const cx = frame.x + frame.width / 2, cy = frame.y + frame.height / 2;
  await page.mouse.move(corfu.x + 30, corfu.y + 30);
  await page.mouse.down();
  await page.mouse.move(cx, cy, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  // Μεγέθυνση με τη ροδέλα στο κέντρο (εκεί που τώρα είναι η Κέρκυρα).
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -400); await page.waitForTimeout(250); }
  await page.waitForTimeout(900);
  check("μετά την κίνηση εμφανίζεται «Αναζήτηση σε αυτή την περιοχή»", (await page.locator("[data-board-search-area]").count()) === 1);
  await page.locator("[data-board-search-area]").click();
  await page.waitForTimeout(600);
  const items = await page.locator("[data-board-item]").count();
  let t = await text(page);
  check("η λίστα κρατά μόνο τα αιτήματα της περιοχής (Κέρκυρα)", items >= 1 && t.includes("Κέρκυρα") && !t.includes("Λαύριο"), `${items} · ${t.slice(0, 300)}`);
  check("φαίνεται ότι η λίστα είναι φιλτραρισμένη, με επιστροφή σε όλες", t.includes("Αιτήματα στην περιοχή του χάρτη") && t.includes("Όλες οι περιοχές"));
  await shoot(page, "map-board-area");
  await page.locator("[data-board-area-clear]").click();
  await page.waitForTimeout(400);
  check("«Όλες οι περιοχές» → ξανά όλα τα αιτήματα", (await page.locator("[data-board-item]").count()) >= 3);

  console.log("\n== 2. Μεταφορές: διαδρομές στον χάρτη");
  await page.locator("[data-board-kind=delivery]").click();
  await page.waitForTimeout(1500);
  const routes = await page.evaluate(() => {
    const m = document.querySelector("[data-board-map] [role=region]").__map;
    const n = (id) => m.getSource(id)?.serialize()?.data?.features?.length || 0;
    const a = n("ov-routes");
    const b = n("ov-route-active");
    return a + b;
  });
  check("η μεταφορά Λαύριο → Ρόδος φαίνεται ως γραμμή", routes >= 1, routes);
  check("ετικέτα ημερομηνίας στην αφετηρία", (await page.locator("[data-map-pin]").count()) >= 1);
  await shoot(page, "map-board-delivery");
  await page.close();
}

console.log("\n== 3. Κινητό: κουμπί «Χάρτης», κάρτα αιτήματος κάτω, «Λίστα»");
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  watch(page);
  await go(page, "/platform/board");
  check("χωρίς χάρτη στη σελίδα πριν πατηθεί το κουμπί", (await page.locator("[data-board-map]").count()) === 0);
  await page.locator("[data-board-map-open]").click();
  await page.waitForSelector('[data-board-map] [data-map-ready="true"]', { timeout: 30000 });
  await page.waitForTimeout(600);
  const id = sql(`select id from booking_requests where departure_point = 'Νάουσα (Πάρος)' and created_at >= '${t0}'`);
  await page.locator(`[data-map-pin="${id}"]`).click();
  await page.waitForTimeout(500);
  const sheet = await page.locator("[data-board-sheet]").innerText().catch(() => "");
  check("πάτημα σε ετικέτα → κάρτα του αιτήματος με «Διεκδίκηση»", sheet.includes("Νάουσα") && sheet.includes("Διεκδίκηση"), sheet);
  await page.screenshot({ path: new URL("./output/design-map-board-mobile-m.png", import.meta.url).pathname });
  await page.locator("[data-board-list]").click();
  await page.waitForTimeout(400);
  check("«Λίστα» → πίσω στη λίστα", (await page.locator("[data-board-map]").count()) === 0 && (await page.locator("[data-board-map-open]").count()) === 1);
  await page.close();
}

console.log("\n== 4. Αγγλικά");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
  const page = await ctx.newPage();
  watch(page);
  await go(page, "/platform/board");
  await page.waitForSelector('[data-board-map] [data-map-ready="true"]', { timeout: 30000 });
  const pinsText = await page.locator("[data-map-pin]").allInnerTexts();
  check("αγγλικά: ημερομηνίες στις ετικέτες χωρίς ελληνικά", pinsText.length >= 3 && !pinsText.some((x) => /[Ͱ-Ͽ]/.test(x)), pinsText);
  check("αγγλικά: χειριστήρια χάρτη", (await page.locator('[aria-label="Zoom in"]').count()) === 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  check("αγγλικά: κουμπί «Map» στο κινητό", (await page.locator("[data-board-map-open]").innerText()).trim() === "Map");
  await shoot(page, "map-board-en");
  await ctx.close();
}
await browser.close();
check("χωρίς σφάλματα σελίδας (επισκέπτης)", errors.length === 0, errors.join(" | "));

console.log("\n== 5. Αναζήτηση: χάρτης κάτω από το λιμάνι, επιλογή με πάτημα");
await as("6900002002", async (page) => {
  await go(page, "/platform/search");
  await pickPlace(page, "Λαύριο");
  await page.waitForSelector('[data-choice-map] [data-map-ready="true"]', { timeout: 30000 });
  check("χάρτης με το λιμάνι που διαλέχτηκε", (await page.locator("[data-choice-map] [data-map-pin]").innerText()).includes("Λαύριο"));
  await shoot(page, "map-search-choice");
  // Πάτημα στον Φλοίσβο → γίνεται η νέα επιλογή.
  await page.evaluate(() => document.querySelector("[data-choice-map] [role=region]").__map.jumpTo({ center: [23.88, 37.82], zoom: 9 }));
  await page.waitForTimeout(300);
  const target = await page.evaluate(() => {
    const el = document.querySelector("[data-choice-map] [role=region]");
    const p = el.__map.project([23.69222, 37.92766]);
    const r = el.getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y, inside: p.x > 0 && p.y > 0 && p.x < r.width && p.y < r.height };
  });
  check("ο Φλοίσβος φαίνεται στον χάρτη", target.inside, target);
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(800);
  const title = await page.locator("[data-place-title]").first().innerText();
  check("πάτημα στον Φλοίσβο → η επιλογή γίνεται «Φλοίσβος»", title.includes("Φλοίσβος"), title);
  // Στεριά στη Θεσσαλία, μακριά από κάθε λιμάνι.
  const inland = await page.evaluate(() => {
    const el = document.querySelector("[data-choice-map] [role=region]");
    el.__map.jumpTo({ center: [22.0, 39.35], zoom: 9 });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.waitForTimeout(300);
  await page.mouse.click(inland.x, inland.y);
  await page.waitForTimeout(600);
  check("πάτημα στη στεριά μακριά από λιμάνι → μήνυμα, χωρίς αλλαγή", (await text(page)).includes("Εδώ δεν υπάρχει λιμάνι που καλύπτουμε") && (await page.locator("[data-place-title]").first().innerText()).includes("Φλοίσβος"));
});

console.log("\n== 6. Μεταφορά σκάφους: διαδρομή και ευθεία απόσταση στη φόρμα");
await as("6900002002", async (page) => {
  await go(page, "/platform/delivery");
  await page.getByRole("button", { name: "Συνέχεια", exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder("π.χ. Άλιμος").fill("Λαύριο");
  await page.getByPlaceholder("π.χ. Ρόδος").fill("Ρόδος");
  await page.waitForSelector('[data-place-map] [data-map-ready="true"]', { timeout: 30000 });
  const dist = await page.locator("[data-place-map-distance]").innerText();
  check("χάρτης με διαδρομή και «≈ … ν.μ. σε ευθεία»", /≈ \d+ ν\.μ\. σε ευθεία/.test(dist) && (await page.locator("[data-place-map] [data-map-pin]").count()) === 2, dist);
  await shoot(page, "map-delivery-form");
  await page.getByPlaceholder("π.χ. Ρόδος").fill("Κάπου αλλού");
  await page.waitForTimeout(400);
  check("άγνωστος προορισμός → μόνο η αφετηρία, χωρίς απόσταση", (await page.locator("[data-place-map] [data-map-pin]").count()) === 1 && (await page.locator("[data-place-map-distance]").count()) === 0);
});

// Καθαρισμός: τα επόμενα τεστ βρίσκουν τα δεδομένα όπως ήταν.
trusted(`delete from booking_requests where client_id = '${CLIENT}' and created_at >= '${t0}';
         delete from delivery_requests where client_id = '${CLIENT}' and created_at >= '${t0}';
         delete from request_drafts where user_id = '${CLIENT}';
         update users set locale = 'el' where id = '${CLIENT}';`);
check("καθαρισμός", num(`select count(*) from booking_requests where client_id = '${CLIENT}' and created_at >= '${t0}'`) === 0);

finish();
