// Υγεία εφαρμογής (0120): κάθε σφάλμα φτάνει με αρκετά στοιχεία για να
// διορθωθεί — έκδοση, συσκευή, τα τελευταία βήματα — από τον browser, από
// αποτυχία ενέργειας στη βάση και από τον διακομιστή. Ο ιδιοκτήτης τα βλέπει
// και μπορεί να τα αντιγράψει.
import { as, go, text, check, finish, sql, shoot } from "./lib.mjs";

const MARIA = "6900002002", ADMIN = "6900002001";
const mariaId = sql(`select id from users where phone_number = '+30${MARIA}'`);
sql(`delete from health_events; delete from health_issues;`);
sql(`insert into notifications (user_id, kind, data) values ('${mariaId}', 'welcome', '{}'::jsonb)`);
const ctxOf = (fp) => JSON.parse(sql(`select coalesce(context::text, 'null') from health_events where fingerprint = '${fp}' order by created_at desc limit 1`) || "null");

await as(MARIA, async (page) => {
  // 1. Σφάλμα κώδικα που δεν πιάστηκε, μετά από μερικά βήματα.
  await go(page, "/platform/bookings");
  await go(page, "/platform/requests");
  await page.getByRole("button", { name: /^Ειδοποιήσεις/ }).click();
  await page.waitForTimeout(400);
  await page.evaluate(() => { Promise.reject(new Error("e2e: δοκιμαστικό σφάλμα")); });
  await page.waitForTimeout(1500);

  // 2. Αποτυχία ενέργειας στη βάση (όχι αναμενόμενη απάντηση): δικαιώματα.
  await page.route(/\/rest\/v1\/rpc\/mark_notifications_read/, (r) =>
    r.fulfill({ status: 403, contentType: "application/json", body: '{"code":"42501","message":"permission denied for function mark_notifications_read"}' }));
  await page.getByRole("button", { name: "Όλα ως διαβασμένα" }).click();
  await page.waitForTimeout(1500);
});

const c1 = ctxOf("app:error:unhandled_promise@/platform/requests");
check("σφάλμα κώδικα: έκδοση και συσκευή", Boolean(c1?.v && c1?.d), JSON.stringify(c1));
check("σφάλμα κώδικα: τα βήματα πριν (σελίδες και κουμπί), χωρίς θόρυβο παρασκηνίου",
  c1?.t?.includes("άνοιξε /platform/bookings") && c1?.t?.includes("άνοιξε /platform/requests") && c1?.t?.some((x) => x.startsWith("πάτησε «Ειδοποιήσεις"))
    && !c1?.t?.some((x) => /^(my_|touch_)/.test(x)), JSON.stringify(c1?.t));

const c2 = ctxOf("app:rpc:mark_notifications_read.42501@/platform/requests");
check("αποτυχία βάσης: καταγράφηκε με όνομα ενέργειας και κωδικό", Boolean(c2), JSON.stringify(c2));
check("αποτυχία βάσης: τα βήματα δείχνουν τι πατήθηκε και τι απέτυχε",
  c2?.t?.includes("πάτησε «Όλα ως διαβασμένα»") && c2?.t?.at(-1) === "mark_notifications_read → 42501", JSON.stringify(c2?.t));
check("καμία αναμενόμενη απάντηση δεν έγινε θέμα",
  Number(sql(`select count(*) from health_issues where fingerprint like 'app:rpc:%' and fingerprint not like '%42501%'`)) === 0);

// 3. Σφάλμα διακομιστή που δεν πιάστηκε (άκυρο σώμα αιτήματος).
await as(ADMIN, async (page) => {
  await go(page, "/platform/admin");
  const status = await page.evaluate(async () => {
    const key = Object.keys(localStorage).find((k) => k.includes("auth-token"));
    const token = JSON.parse(localStorage.getItem(key)).access_token;
    const r = await fetch("/api/platform/admin/edit-contact", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: "όχι json" });
    return r.status;
  });
  check("ο διακομιστής απάντησε σφάλμα", status >= 500, String(status));
  await page.waitForTimeout(1500);
  const server = sql(`select count(*) from health_issues where fingerprint like 'app:server:%edit-contact%'`);
  check("σφάλμα διακομιστή: καταγράφηκε μόνο του", Number(server) === 1, server);

  await go(page, "/platform/admin/health");
  const t = await text(page);
  check("ο ιδιοκτήτης βλέπει τα βήματα", t.includes("πάτησε «Όλα ως διαβασμένα»") && t.includes("mark_notifications_read → 42501"), t.slice(0, 600));
  check("και την έκδοση/συσκευή", /έκδοση \S+ · /.test(t));
  check("και το σφάλμα διακομιστή", t.includes("Σφάλμα διακομιστή") && t.includes("Διακομιστής"));
  await shoot(page, "admin-health-context");
  check("κουμπί «Αντιγραφή για διόρθωση»", (await page.getByRole("button", { name: "Αντιγραφή για διόρθωση" }).count()) >= 3);
});

sql(`delete from health_events; delete from health_issues;`);
finish();
