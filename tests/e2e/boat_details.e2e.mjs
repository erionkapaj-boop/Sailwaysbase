// Στοιχεία σκάφους στα αιτήματα (0127): ο πελάτης γράφει μοντέλο, μήκος και έτος,
// ο επισκέπτης τα βλέπει στον πίνακα (και στις δύο γλώσσες), η φόρμα μεταφοράς
// και ο οδηγός αναζήτησης ζητούν τα ίδια πεδία. Τα δεδομένα επαναφέρονται.
import { chromium } from "playwright";
import { BASE, as, go, text, click, check, finish, sql, num, daysFromToday, iso, shoot } from "./lib.mjs";

const CLIENT = "a0000000-0000-0000-0000-000000000002";
const bal = (id) => num(`select wallet_balance from users where id = '${id}'`);
const wallet0 = bal(CLIENT);
const day = (n) => iso(daysFromToday(n));

await as("6900002002", async (page) => {
  console.log("\n== 1. Ανάρτηση αιτήματος με στοιχεία σκάφους");
  await go(page, "/platform/board/new");
  await page.waitForTimeout(800);
  await page.locator("#bn-start").fill(day(20));
  await page.locator("#bn-end").fill(day(24));
  await page.locator("#bn-region").selectOption({ label: "Κυκλάδες" });
  await page.locator("#bn-dep").fill("Πάρος");
  await page.locator("#bn-arr").fill("Πάρος");
  await page.locator("#bn-boat").selectOption({ label: "Ιστιοπλοϊκό" });
  await page.getByLabel("Μοντέλο σκάφους").fill("Lagoon 42");
  await page.getByLabel("Μήκος (πόδια)").fill("42");
  await page.getByLabel("Έτος κατασκευής").fill("2019");
  await shoot(page, "boat-form");
  await page.getByLabel("Μήκος (πόδια)").fill("5");
  check("εκτός ορίων: το κουμπί ανάρτησης κλειδώνει και εξηγεί", (await page.getByRole("button", { name: "Ανάρτηση αιτήματος", exact: true }).isDisabled()) && (await text(page)).includes("Έλεγξε το μήκος"));
  await page.getByLabel("Μήκος (πόδια)").fill("42");
  await click(page, "Ανάρτηση αιτήματος");
  await page.waitForTimeout(2000);
  check("στη βάση, με τα στοιχεία σκάφους", num(`select count(*) from booking_requests where board_open and boat_model = 'Lagoon 42' and boat_length_ft = 42 and boat_year = 2019`) === 1);
});

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
for (const [loc, expectedBoat] of [["el", "Lagoon 42 · 42 ft · 2019"], ["en", "Lagoon 42 · 42 ft · 2019"]]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: "sf_locale", value: loc, url: BASE }]);
  const page = await ctx.newPage();
  await go(page, "/platform/board");
  await page.waitForTimeout(1500);
  const line = await page.locator("[data-boat-line]").first().innerText().catch(() => "");
  check(`${loc}: ο επισκέπτης βλέπει «${expectedBoat}» στον πίνακα`, line === expectedBoat, line);
  check(`${loc}: δίπλα στο σκάφος φαίνεται η ενδεικτική εικόνα με ένδειξη AI`, (await page.locator("[data-boat-thumb]").first().innerText().catch(() => "")).trim() === "AI" && Boolean(await page.locator("[data-boat-thumb] img").first().getAttribute("src").catch(() => "")));
  await shoot(page, `boat-board-${loc}`);
  await ctx.close();
}

console.log("\n== 2. Μεταφορά σκάφους: η φόρμα ζητά τα ίδια στοιχεία, και ο πίνακας μεταφορών τα δείχνει");
sql(`select set_config('platform.trusted','true',false);
insert into delivery_requests (client_id, origin_point, destination_point, distance_miles, date_mode, departure_date, flexible_days, covers_tickets, covers_travel, covers_food, covers_fuel, covers_port_expenses, boat_model, boat_length_ft, boat_year)
values ('${CLIENT}', 'Λαύριο', 'Λευκάδα', 300, 'fixed', current_date + 30, 0, true, true, false, true, false, 'Bavaria 46', 46, 2015);
insert into delivery_role_requests (delivery_request_id, crew_role, offered_price, commission_base, platform_commission, client_fee, professional_fee, fee_paid_at, expires_at, board_open)
select id, 'skipper', 900, 0, 0, 0, 0, now(), (departure_date + 1)::timestamptz, true from delivery_requests where boat_model = 'Bavaria 46'`);
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await go(page, "/platform/board");
  await page.waitForTimeout(800);
  await page.locator('[data-board-kind="delivery"]').click();
  await page.waitForTimeout(1500);
  const line = await page.locator("[data-boat-line]").first().innerText().catch(() => "");
  check("ο πίνακας μεταφορών δείχνει «Bavaria 46 · 46 ft · 2015»", line === "Bavaria 46 · 46 ft · 2015", line);
  await shoot(page, "boat-delivery-board");
  await ctx.close();
}
await as("6900002002", async (page) => {
  await go(page, "/platform/delivery");
  await click(page, "Συνέχεια");
  await page.waitForTimeout(600);
  const t = await text(page);
  check("η φόρμα μεταφοράς έχει μοντέλο, μήκος, έτος", t.includes("Μοντέλο σκάφους") && t.includes("Μήκος (πόδια)") && t.includes("Έτος κατασκευής"), t.slice(0, 300));
});

console.log("\n== 3. Οδηγός αναζήτησης πληρώματος: τα στοιχεία περνούν στη σελίδα αποτελεσμάτων");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const region = sql(`select id from regions where name = 'Κυκλάδες'`);
  await go(page, `/platform/search?roles=hostess&start=${day(20)}&end=${day(24)}&region=${region}&point=${encodeURIComponent("Νάξος")}&arrival=${encodeURIComponent("Νάξος")}&party=4&cabin=true&bm=${encodeURIComponent("Ocean Star")}&bl=52&by=2012`);
  await page.waitForTimeout(2000);
  const t = await text(page);
  check("η σύνοψη δείχνει «Ocean Star · 52 ft · 2012»", t.includes("Ocean Star · 52 ft · 2012"), t.slice(0, 400));
  await shoot(page, "boat-search");
  await ctx.close();
}
await browser.close();

// Καθαρισμός: τα επόμενα τεστ περιμένουν credits και αιτήματα όπως ήταν.
sql(`select set_config('platform.trusted','true',false);
delete from wallet_transactions where related_booking_request_id in (select id from booking_requests where board_open)
   or related_delivery_role_request_id in (select rr.id from delivery_role_requests rr join delivery_requests d on d.id = rr.delivery_request_id where d.boat_model is not null);
delete from delivery_role_requests where delivery_request_id in (select id from delivery_requests where boat_model is not null);
delete from delivery_requests where boat_model is not null;
delete from notifications where kind like 'board_%';
delete from booking_requests where board_open;
update users set wallet_balance = ${wallet0} where id = '${CLIENT}';`);
check("καθαρισμός: υπόλοιπο και αιτήματα όπως πριν", bal(CLIENT) === wallet0 && num("select count(*) from booking_requests where board_open") === 0);

finish();
