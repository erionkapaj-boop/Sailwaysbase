// Αίτημα για πολλούς skippers (0133): μετρητής 1–10, κόστος σε credits δίπλα,
// κόκκινο μήνυμα όταν δεν φτάνουν τα διαθέσιμα, N ξεχωριστά αιτήματα με
// δέσμευση. Και το προσωπικό όριο αιτημάτων από την καρτέλα του χρήστη.
// Τα δεδομένα επαναφέρονται.
import { as, go, text, click, check, finish, sql, num, daysFromToday, iso, shoot } from "./lib.mjs";

const CLIENT = "a0000000-0000-0000-0000-000000000002";
const wallet0 = num(`select wallet_balance from users where id = '${CLIENT}'`);
const day = (n) => iso(daysFromToday(n));
const reserved = () => num(`select user_reserved_credits('${CLIENT}')`);
const setAvailable = (n) => sql(`select set_config('platform.trusted','true',false); update users set wallet_balance = ${reserved()} + ${n} where id = '${CLIENT}'`);
const fee = num(`select value from platform_settings where key = 'client_request_fee'`);
const START = day(61);

async function fill(page) {
  await page.locator("#bn-start").fill(START);
  await page.locator("#bn-end").fill(day(64));
  await page.locator("#bn-region").selectOption({ label: "Κυκλάδες" });
  await page.locator("#bn-dep").fill("Πάρος");
  await page.locator("#bn-arr").fill("Πάρος");
  await page.locator("#bn-boat").selectOption({ label: "Ιστιοπλοϊκό" });
}

setAvailable(3 * fee);
await as("6900002002", async (page) => {
  console.log("\n== 1. Μετρητής, κόστος, κόκκινο μήνυμα");
  await go(page, "/platform/board/new");
  await page.waitForTimeout(1200);
  await fill(page);
  const out = page.locator("[data-skipper-count] output");
  check("προεπιλογή 1", (await out.innerText()) === "1");
  check("κόστος δίπλα: 1 skipper", (await page.locator("[data-request-cost]").innerText()).includes(String(fee)));
  check("το «−» κλειδώνει στο 1", await page.getByRole("button", { name: "Λιγότεροι" }).isDisabled());
  const more = page.getByRole("button", { name: "Περισσότεροι" });
  await more.click(); await more.click();
  check("3 skippers, κόστος 3 credits, χωρίς σφάλμα", (await out.innerText()) === "3" && (await page.locator("[data-request-cost]").innerText()).includes(String(3 * fee)) && (await page.locator("[data-credit-short]").count()) === 0);
  await more.click();
  await page.waitForTimeout(300);
  const short = page.locator("[data-credit-short]");
  check("4 skippers: κόκκινο μήνυμα στο πεδίο", (await short.count()) === 1 && (await short.innerText()).includes(String(4 * fee)));
  const color = await short.evaluate((n) => getComputedStyle(n).color);
  const errColor = await page.evaluate(() => { const p = document.querySelector("[role=alert]"); return p ? getComputedStyle(p).color : ""; });
  check("ίδιο κόκκινο με τα άλλα σφάλματα της φόρμας", color === errColor && color !== "");
  check("η ανάρτηση κλειδώνει", await page.getByRole("button", { name: "Ανάρτηση αιτήματος", exact: true }).isDisabled());
  await shoot(page, "multi-skippers-short");
  await page.getByRole("button", { name: "Λιγότεροι" }).click();
  await page.waitForTimeout(300);
  check("στα 3 το μήνυμα φεύγει", (await page.locator("[data-credit-short]").count()) === 0);
  await shoot(page, "multi-skippers");
  await click(page, "Ανάρτηση αιτήματος");
  await page.waitForTimeout(2500);
  check("στη βάση: 3 ξεχωριστά αιτήματα, ίδια ημερομηνία", num(`select count(*) from booking_requests where client_id = '${CLIENT}' and board_open and start_date = '${START}'`) === 3);
  check("δεσμεύτηκαν όλα, χωρίς χρέωση", reserved() >= 3 * fee && num(`select wallet_balance from users where id = '${CLIENT}'`) >= 3 * fee);
});

console.log("\n== 2. Όριο ανά λογαριασμό");
await as("6900002001", async (page) => {
  await go(page, `/platform/admin/user/${CLIENT}?tab=actions`);
  await page.waitForTimeout(1500);
  const sel = page.locator("[data-request-limit] select");
  check("η καρτέλα δείχνει το όριο, προεπιλογή", (await sel.inputValue()) === "default");
  await sel.selectOption("unlimited");
  await click(page, "Αποθήκευση");
  await page.waitForTimeout(1200);
  check("αποθηκεύτηκε: χωρίς όριο", num(`select request_limit from users where id = '${CLIENT}'`) === -1);
  await sel.selectOption("custom");
  await page.locator("[data-request-limit] input[type=number]").fill("5");
  await click(page, "Αποθήκευση");
  await page.waitForTimeout(1200);
  check("αποθηκεύτηκε: όριο 5", num(`select request_limit from users where id = '${CLIENT}'`) === 5);
  await shoot(page, "request-limit-admin");
});

// Επαναφορά.
sql(`select set_config('platform.trusted','true',false);
delete from booking_requests where client_id = '${CLIENT}' and start_date = '${START}';
update users set request_limit = null, wallet_balance = ${wallet0} where id = '${CLIENT}'`);
finish();
