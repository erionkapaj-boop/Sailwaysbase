// Κινητό που ξυπνά: το κλειδί σύνδεσης έχει λήξει και η ανανέωση αποτυγχάνει
// όσο δεν έχει έρθει ακόμα το δίκτυο. Η Supabase τότε στέλνει τις κλήσεις ως
// επισκέπτης και η βάση απαντά «permission denied» (στην Υγεία:
// db_42501 στο admin_health_issues). Ο χρήστης είναι ακόμα συνδεδεμένος: η
// κλήση πρέπει να ξαναγίνει με ανανεωμένη σύνδεση, χωρίς σφάλμα.
import { as, go, text, check, finish, sql } from "./lib.mjs";

const ADMIN = "6900002001";
sql(`delete from health_events; delete from health_issues;`);

await as(ADMIN, async (page) => {
  await go(page, "/platform/admin");

  // Το κλειδί «έληξε»· η ανανέωση αποτυγχάνει μέχρι να φύγει η πρώτη κλήση ως επισκέπτης.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.includes("auth-token"));
    const s = JSON.parse(localStorage.getItem(key));
    s.expires_at = Math.floor(Date.now() / 1000) - 60;
    localStorage.setItem(key, JSON.stringify(s));
  });
  let networkBack = false;
  let anonCalls = 0;
  await page.route(/\/auth\/v1\/token/, (r) => (networkBack ? r.continue() : r.abort("internetdisconnected")));
  await page.route(/\/rest\/v1\/rpc\/admin_health_issues/, (r) => {
    const auth = r.request().headers()["authorization"] || "";
    const role = (() => {
      try {
        return JSON.parse(Buffer.from(auth.split(".")[1], "base64url").toString()).role;
      } catch {
        return null;
      }
    })();
    if (role === "anon") {
      anonCalls += 1;
      networkBack = true;
    }
    r.continue();
  });

  const statuses = [];
  page.on("response", (r) => { if (/rpc\/admin_health_issues/.test(r.url())) statuses.push(r.status()); });
  // Μέσα από την εφαρμογή (όπως στο κινητό: η σελίδα ήταν ήδη ανοιχτή).
  await page.locator('a[href="/platform/admin/health"]').first().click();
  const started = Date.now();
  while (anonCalls === 0 && Date.now() - started < 60000) await page.waitForTimeout(500);
  await page.waitForTimeout(4000);
  check("η κλήση έφυγε πρώτα ως επισκέπτης (αναπαράχθηκε)", anonCalls >= 1, String(anonCalls));

  check("ξαναστάλθηκε με τη σύνδεση και πέτυχε", statuses.includes(401) && statuses.at(-1) === 200, statuses.join(","));
  const t = await text(page);
  check("η σελίδα φόρτωσε χωρίς μήνυμα σφάλματος", !/permission denied|δικαιώματα|Κάτι πήγε στραβά/i.test(t), t.slice(0, 400));
  const issues = sql(`select coalesce(string_agg(fingerprint, ', '), '') from health_issues where fingerprint like '%42501%'`);
  check("δεν καταγράφηκε db_42501", issues === "", issues);
});

finish();
