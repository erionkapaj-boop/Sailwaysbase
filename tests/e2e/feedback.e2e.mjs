// «Κάτι έγινε»: μετά από κάθε πάτημα που αλλάζει κάτι, ο χρήστης το βλέπει αμέσως: μήνυμα κάτω
// στην οθόνη και το κουμπί γίνεται πράσινο με τικ. Αποτυχία: μήνυμα αποτυχίας. Αναμενόμενη
// άρνηση (π.χ. δεν επιτρέπεται η τιμή): μόνο η οθόνη, χωρίς μήνυμα αποτυχίας. Παρασκήνιο: τίποτα.
import { as, go, text, check, finish, OUT } from "./lib.mjs";

const MARIA = "6900002002";
const fixedToast = (page) =>
  page.locator('div[style*="position: fixed"][role="status"], div[style*="position: fixed"][role="alert"]');

await as(MARIA, async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, "/platform/profile");
  // Μετά την αποθήκευση η ετικέτα του κουμπιού γίνεται «Αποθηκεύτηκε»: ίδιο κουμπί.
  const save = page.getByRole("button").filter({ hasText: /^(Αποθήκευση|Αποθηκεύτηκε)$/ });
  await save.scrollIntoViewIfNeeded();

  // 1. Επιτυχία: μήνυμα + πράσινο κουμπί.
  await save.click();
  await fixedToast(page).first().waitFor({ timeout: 8000 });
  const t1 = (await fixedToast(page).first().innerText()).trim();
  check("επιτυχία: μήνυμα κάτω στην οθόνη", /αποθηκεύτηκε/i.test(t1), t1);
  const box = await fixedToast(page).first().boundingBox();
  const vp = page.viewportSize();
  check("το μήνυμα φαίνεται μέσα στην οθόνη, κάτω", box && box.y + box.height <= vp.height && box.y > vp.height * 0.6, JSON.stringify(box));
  check("το κουμπί γίνεται πράσινο με τικ", (await page.locator("button.sf-ok").count()) === 1);
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/design-feedback-done-m.png` });
  await page.waitForTimeout(3300);
  check("το μήνυμα φεύγει μόνο του", (await fixedToast(page).count()) === 0);
  check("και το κουμπί γυρίζει στο κανονικό", (await page.locator("button.sf-ok").count()) === 0);

  // Ίδιο σε οθόνη υπολογιστή.
  await page.setViewportSize({ width: 1280, height: 900 });
  await save.scrollIntoViewIfNeeded();
  await save.click();
  await fixedToast(page).first().waitFor({ timeout: 8000 });
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/design-feedback-done-d.png` });
  await page.waitForTimeout(3300);

  // 2. Απρόσμενη αποτυχία (σφάλμα διακομιστή): μήνυμα αποτυχίας, όχι επιτυχίας, κουμπί όχι πράσινο.
  await page.route(/\/rest\/v1\/(users|client_profiles)/, (r) =>
    r.request().method() === "PATCH" || r.request().method() === "POST" || r.request().method() === "DELETE"
      ? r.fulfill({ status: 500, contentType: "application/json", body: '{"message":"boom"}' })
      : r.continue());
  await page.setViewportSize({ width: 390, height: 844 });
  await save.scrollIntoViewIfNeeded();
  await save.click();
  await fixedToast(page).first().waitFor({ timeout: 8000 });
  const t2 = (await fixedToast(page).first().innerText()).trim();
  check("αποτυχία: μήνυμα αποτυχίας", t2.includes("Δεν ολοκληρώθηκε"), t2);
  check("αποτυχία: δεν γίνεται πράσινο το κουμπί", (await page.locator("button.sf-ok").count()) === 0);
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/design-feedback-fail-m.png` });
  check("μετά από αποτυχία το κουμπί δεν γράφει «Αποθηκεύτηκε»", !(await page.locator("button", { hasText: /^Αποθηκεύτηκε$/ }).count()));
  await page.waitForTimeout(5600);
  await page.unroute(/\/rest\/v1\/(users|client_profiles)/);

  // 3. Αναμενόμενη άρνηση της βάσης (400): δεν εμφανίζεται μήνυμα αποτυχίας, το χειρίζεται η οθόνη.
  await page.route(/\/rest\/v1\/(users|client_profiles)/, (r) =>
    r.request().method() === "PATCH" || r.request().method() === "POST" || r.request().method() === "DELETE"
      ? r.fulfill({ status: 400, contentType: "application/json", body: '{"code":"P0001","message":"invalid_value"}' })
      : r.continue());
  await save.click();
  await page.waitForTimeout(1500);
  check("αναμενόμενη άρνηση: όχι μήνυμα αποτυχίας από το γενικό σύστημα", (await fixedToast(page).count()) === 0);
  await page.unroute(/\/rest\/v1\/(users|client_profiles)/);
});

// 4. Ό,τι τρέχει στο παρασκήνιο (παρακολούθηση βημάτων, τελευταία είσοδος) δεν δίνει μηνύματα.
await as(MARIA, async (page) => {
  await go(page, "/platform");
  await page.waitForTimeout(1500);
  check("παρασκήνιο: κανένα μήνυμα", (await fixedToast(page).count()) === 0);
});

finish();
