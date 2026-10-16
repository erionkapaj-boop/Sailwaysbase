// Εγγραφή και σύνδεση με Google (0121). Η «Google» είναι το gateway των τεστ:
// ορίζουμε ποιος θα επιστρέψει και η εφαρμογή περνά από την πραγματική ροή
// (κουμπί → authorize → επιστροφή με code → σύνδεση).
import { chromium } from "playwright";
import { BASE, check, finish, sql, shoot, text, as, hydrationOnly } from "./lib.mjs";
import { TEST_PIN } from "./gateway.mjs";

const GATEWAY = process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_URL;
const MARIA = "6900002002", NIKOS = "6900002003";
const ORPHAN = "6900009901"; // εγγραφή με τηλέφωνο που κόπηκε: ταυτότητα χωρίς λογαριασμό
const EMAILS = ["nea.pelatis@gmail.com", "pro.google@gmail.com", "taken.google@gmail.com", "maria.google@gmail.com", "cancel.google@gmail.com"];

const persona = (p) => fetch(`${GATEWAY}/__google/next`, { method: "POST", body: JSON.stringify(p) });

async function browser(fn) {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => { if (hydrationOnly(e, page)) return; if (!e.message.startsWith("e2e:")) errors.push(e.message); });
  try {
    await fn(page);
    check("χωρίς σφάλματα σελίδας", errors.length === 0, errors.join(" | "));
  } catch (e) {
    await page.screenshot({ path: new URL(`./output/failure-google-${Date.now()}.png`, import.meta.url).pathname }).catch(() => {});
    check("η ροή ολοκληρώθηκε", false, e.stack || e.message);
  } finally {
    await b.close();
  }
}
const row = (email) =>
  sql(`select concat_ws('|', phone_verified_at is not null, status, role, email, phone_number) from users where email = '${email}'`);

const cleanup = () => {
  const list = EMAILS.map((e) => `'${e}'`).join(",");
  try {
    sql(`
      create temp table _g as select id from users where email in (${list});
      delete from wallet_transactions where user_id in (select id from _g);
      delete from notifications where user_id in (select id from _g);
      delete from skipper_profiles where user_id in (select id from _g);
      delete from client_profiles where user_id in (select id from _g);
      delete from users where id in (select id from _g);
      delete from auth.users where email in (${list}) or id in (select id from _g);`);
  } catch (e) {
    console.log("   (καθαρισμός δεν ολοκληρώθηκε)", String(e.message).slice(0, 120));
  }
};
cleanup();

// 1. Νέος πελάτης: Εγγραφή → Google → κατευθείαν μέσα (0132): χωρίς φόρμα, χωρίς κινητό, χωρίς κωδικό.
await persona({ email: "nea.pelatis@gmail.com", name: "Νέα Πελάτισσα" });
await browser(async (page) => {
  await page.goto(`${BASE}/platform/register`);
  await page.waitForLoadState("networkidle");
  await shoot(page, "google-register");
  await page.getByRole("button", { name: "Συνέχεια με Google" }).click();
  await page.waitForURL((u) => !u.pathname.includes("/auth/google") && !u.pathname.includes("/register"), { timeout: 20000 });
  await page.waitForTimeout(1500);
  const t = await text(page);
  check("ο νέος πελάτης μπαίνει κατευθείαν, χωρίς φόρμα στοιχείων, κινητού ή κωδικού", !t.includes("Στοιχεία λογαριασμού") && !page.url().includes("set-pin"), page.url());
});
check("ο λογαριασμός ξεκίνησε επαληθευμένος, με το email της Google και χωρίς κινητό",
  row("nea.pelatis@gmail.com") === "t|active|client|nea.pelatis@gmail.com", row("nea.pelatis@gmail.com"));
check("το όνομα έρχεται από τη Google", sql(`select full_name from users where email = 'nea.pelatis@gmail.com'`) === "Νέα Πελάτισσα");

// 2. Ο ίδιος άνθρωπος ξαναμπαίνει με Google: κατευθείαν μέσα, χωρίς φόρμα.
await browser(async (page) => {
  await page.goto(`${BASE}/platform/login`);
  await page.waitForLoadState("networkidle");
  await shoot(page, "google-login");
  await page.getByRole("button", { name: "Συνέχεια με Google" }).click();
  await page.waitForURL((u) => !u.pathname.includes("/auth/google") && !u.pathname.endsWith("/login"), { timeout: 20000 });
  await page.waitForTimeout(1500);
  const t = await text(page);
  check("ξανασύνδεση: μπαίνει στην εφαρμογή, χωρίς φόρμα στοιχείων", !t.includes("Στοιχεία λογαριασμού") && page.url().includes("/platform"), page.url());
});

// 3. Επαγγελματίας.
await persona({ email: "pro.google@gmail.com", name: "Μαρία Καπετάνισσα" });
await browser(async (page) => {
  await page.goto(`${BASE}/platform/register?as=professional`);
  await page.waitForLoadState("networkidle");
  await shoot(page, "google-register-pro");
  await page.getByRole("button", { name: "Συνέχεια με Google" }).click();
  await page.waitForURL(/\/platform\/auth\/google/);
  await page.getByText("Στοιχεία λογαριασμού").waitFor();
  const t = await text(page);
  check("ο επαγγελματίας διαλέγει ιδιότητα και βλέπει τον κωδικό χώρας", t.includes("Ιδιότητα") && (await page.locator("select").count()) === 1, t.slice(0, 300));
  await shoot(page, "google-return-pro");
  await page.fill("#g-phone", "6900009002");
  await page.getByRole("button", { name: "Συνέχεια" }).click();
  await page.waitForURL(/\/platform\/set-pin\?as=professional/);
  check("πάει στον κωδικό ως επαγγελματίας", true);
});
check("επαγγελματίας: επαληθευμένος, σε προσχέδιο, περιμένει έγκριση προφίλ",
  row("pro.google@gmail.com") === "t|draft|skipper|pro.google@gmail.com|+306900009002", row("pro.google@gmail.com"));
check("παίρνει το δώρο των επαγγελματιών, μία φορά",
  sql(`select wallet_balance = (select value from platform_settings where key = 'signup_credits_professional') from users where email = 'pro.google@gmail.com'`) === "t");
check("το προφίλ του περιμένει έγκριση από τη διαχείριση",
  sql(`select approval_status from skipper_profiles where user_id = (select id from users where email = 'pro.google@gmail.com')`) === "pending");

// 4. Τηλέφωνο που ανήκει σε άλλον λογαριασμό: δεν γίνεται εγγραφή.
await persona({ email: "taken.google@gmail.com", name: "Άλλος Άνθρωπος" });
await browser(async (page) => {
  await page.goto(`${BASE}/platform/login`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Συνέχεια με Google" }).click();
  await page.waitForURL(/\/platform\/auth\/google/);
  await page.getByText("Στοιχεία λογαριασμού").waitFor();
  const t = await text(page);
  check("από τη σύνδεση: ρωτά αν είναι πελάτης ή επαγγελματίας", t.includes("Είμαι") && t.includes("Πελάτης") && t.includes("Επαγγελματίας"));
  // Ο πελάτης δεν δίνει πια κινητό στην εγγραφή (0132)· ο κανόνας «το κινητό ανήκει σε άλλον» ισχύει για επαγγελματία.
  await page.getByRole("button", { name: "Επαγγελματίας", exact: true }).click();
  await page.fill("#g-phone", MARIA);
  await page.getByRole("button", { name: "Συνέχεια" }).click();
  await page.getByText("Δεν γίνεται εγγραφή με αυτό το τηλέφωνο").waitFor();
  await shoot(page, "google-return-error");
  check("το τηλέφωνο άλλου λογαριασμού δεν δίνεται", true);
});
check("δεν δημιουργήθηκε λογαριασμός", sql(`select count(*) from users where email = 'taken.google@gmail.com'`) === "0");
check("ούτε μπήκε το τηλέφωνο στην ταυτότητα Google", sql(`select coalesce(phone, '') from auth.users where email = 'taken.google@gmail.com'`) === "");

// 5. Σύνδεση Google σε υπάρχοντα λογαριασμό από το Προφίλ.
await persona({ email: "maria.google@gmail.com", name: "Μαρία" });
await as(MARIA, async (page) => {
  await page.goto(`${BASE}/platform/profile`);
  await page.waitForLoadState("networkidle");
  await page.getByText("Δεν έχει συνδεθεί").waitFor();
  await page.getByRole("button", { name: "Σύνδεση με Google" }).click();
  await page.waitForURL(/\/platform\/profile/);
  await page.getByText("maria.google@gmail.com").waitFor({ timeout: 20000 });
  check("το Προφίλ δείχνει τη Google που συνδέθηκε", true);
});
check("η ταυτότητα Google μπήκε στον ίδιο λογαριασμό της Μαρίας",
  sql(`select count(*) from auth.identities i join auth.users u on u.id = i.user_id where i.provider = 'google' and u.phone = '30${MARIA}'`) === "1");

// 5β. Ο ίδιος λογαριασμός Google σε δεύτερο χρήστη: δεν συνδέεται, και το λέει.
await as(NIKOS, async (page) => {
  await page.goto(`${BASE}/platform/profile`);
  await page.waitForLoadState("networkidle");
  await page.getByText("Δεν έχει συνδεθεί").waitFor();
  await page.getByRole("button", { name: "Σύνδεση με Google" }).click();
  await page.waitForURL(/\/platform\/profile/);
  await page.getByText("Αυτός ο λογαριασμός Google είναι ήδη συνδεδεμένος με άλλον λογαριασμό.").first().waitFor({ timeout: 20000 });
  check("Google άλλου χρήστη: μήνυμα στο Προφίλ", true);
  check("Google άλλου χρήστη: και κάτω στην οθόνη, χωρίς κύλιση",
    await page.getByRole("alert").filter({ hasText: "ήδη συνδεδεμένος με άλλον" }).first().isVisible());
  await shoot(page, "google-link-taken-toast");
  check("Google άλλου χρήστη: η διεύθυνση καθαρίζει", !/error/.test(page.url()), page.url());
  check("Google άλλου χρήστη: παραμένει συνδεδεμένος", (await page.getByRole("button", { name: "Σύνδεση με Google" }).count()) === 1);
  await shoot(page, "google-link-taken");
});
check("Google άλλου χρήστη: δεν μπήκε δεύτερη ταυτότητα",
  sql(`select count(*) from auth.identities i join auth.users u on u.id = i.user_id where i.provider = 'google' and u.phone = '30${NIKOS}'`) === "0");

// 6. Λογαριασμός σε αναστολή δεν μπαίνει ούτε με Google.
sql(`update users set status = 'suspended' where phone_number = '+30${MARIA}'`);
await browser(async (page) => {
  await page.goto(`${BASE}/platform/login`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Συνέχεια με Google" }).click();
  await page.getByText("Ο λογαριασμός είναι σε αναστολή.").waitFor({ timeout: 20000 });
  check("σε αναστολή: δεν μπαίνει με Google", true);
});
sql(`update users set status = 'active' where phone_number = '+30${MARIA}'`);

// 7. Ακύρωση στη Google.
await persona({ error: true });
await browser(async (page) => {
  await page.goto(`${BASE}/platform/login`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Συνέχεια με Google" }).click();
  await page.getByText("Η σύνδεση με Google δεν ολοκληρώθηκε.").waitFor();
  const t = await text(page);
  check("ακύρωση: μήνυμα και δρόμος πίσω", t.includes("Πίσω στη σύνδεση"));
  await shoot(page, "google-cancelled");
});

// 8. Συνδεδεμένος με Google χωρίς λογαριασμό (έφυγε στη μέση): πάντα υπάρχει έξοδος.
await persona({ email: "cancel.google@gmail.com", name: "Χωρίς Λογαριασμό" });
await browser(async (page) => {
  await page.goto(`${BASE}/platform/login`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Συνέχεια με Google" }).click();
  await page.getByText("Στοιχεία λογαριασμού").waitFor();
  await shoot(page, "google-return-existing");
  // Πάει πίσω στη σελίδα Σύνδεση χωρίς να ολοκληρώσει.
  await page.goto(`${BASE}/platform/login`);
  await page.getByText("Η σύνδεση δεν ολοκληρώθηκε").waitFor();
  await shoot(page, "google-stuck");
  check("σύνδεση χωρίς λογαριασμό: προτείνει συνέχεια εγγραφής ή αποσύνδεση",
    (await page.getByRole("link", { name: "Συνέχεια εγγραφής" }).count()) === 1 && (await page.getByRole("button", { name: "Αποσύνδεση" }).count()) === 1);
  await page.getByRole("button", { name: "Αποσύνδεση" }).click();
  await page.locator("#login-phone").waitFor();
  check("η αποσύνδεση φέρνει πίσω τη φόρμα σύνδεσης", true);
  // Από τη σελίδα στοιχείων: «Έχω ήδη λογαριασμό».
  await page.getByRole("button", { name: "Συνέχεια με Google" }).click();
  await page.getByText("Στοιχεία λογαριασμού").waitFor();
  await page.getByRole("button", { name: "Σύνδεση με τηλέφωνο και κωδικό" }).click();
  await page.waitForURL(/\/platform\/login/);
  await page.locator("#login-phone").waitFor();
  check("«Έχεις ήδη λογαριασμό»: βγάζει από τη σύνδεση Google και πάει στη φόρμα", true);
});

// 9. Εγγραφή με τηλέφωνο που κόπηκε (ταυτότητα χωρίς λογαριασμό): καμία πρόταση να συνεχίσει από
// τη σελίδα της Google, μόνο έξοδος.
sql(`delete from auth.users where phone = '30${ORPHAN}'; insert into auth.users (id, phone) values (gen_random_uuid(), '30${ORPHAN}')`);
await browser(async (page) => {
  await page.goto(`${BASE}/platform/login`);
  await page.waitForLoadState("networkidle");
  await page.locator("#login-phone").fill(ORPHAN);
  await page.locator("#login-pin").fill(TEST_PIN);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/platform/login`);
  await page.getByText("Η σύνδεση δεν ολοκληρώθηκε").waitFor();
  check("εγγραφή με τηλέφωνο χωρίς λογαριασμό: όχι «Συνέχεια εγγραφής» προς τη Google",
    (await page.getByRole("link", { name: "Συνέχεια εγγραφής" }).count()) === 0 && (await page.getByRole("button", { name: "Αποσύνδεση" }).count()) === 1);
  await page.goto(`${BASE}/platform/auth/google`);
  await page.waitForURL(/\/platform\/login/, { timeout: 15000 });
  check("η σελίδα της Google δεν δέχεται σύνδεση χωρίς Google", !(await text(page)).includes("Συνδέθηκες με Google"));
});
sql(`delete from auth.users where phone = '30${ORPHAN}'`);

cleanup();
finish();
