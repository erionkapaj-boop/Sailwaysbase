// Υγεία εφαρμογής (0116): ένα σφάλμα που είδε χρήστης και μια κατάσταση που
// κόλλησε φτάνουν μόνα τους στον ιδιοκτήτη· «Λύθηκε» τα κλείνει.
import { as, go, text, click, check, finish, sql, num } from "./lib.mjs";

const ADMIN = "6900002001", CLIENT = "6900002002";
const trusted = (q) => sql(`select set_config('platform.trusted', 'true', false); ${q}`);
sql(`delete from health_events; delete from health_issues;`);

// 1. Ένας χρήστης πέφτει σε σφάλμα που δεν πιάνει καμία οθόνη.
await as(CLIENT, async (page) => {
  await go(page, "/platform/requests");
  await page.evaluate(() => setTimeout(() => { throw new Error("e2e: κάτι έσπασε"); }, 0));
  await page.waitForTimeout(1500);
});
check("το σφάλμα καταγράφηκε χωρίς να το ζητήσει κανείς",
  num(`select count(*) from health_events where page = '/platform/requests' and detail like '%e2e: κάτι έσπασε%'`) === 1);

// 2. Κάτι κόλλησε στα δεδομένα: λογαριασμός χωρίς επιβεβαίωση εδώ και μέρες.
trusted(`update users set phone_verified_at = null, created_at = now() - interval '5 days'
          where phone_number = '+306900002005'`);

await as(ADMIN, async (page) => {
  await go(page, "/platform/admin/health");
  let t = await text(page);
  check("η σελίδα δείχνει το σφάλμα του χρήστη", t.includes("Η σελίδα έσπασε") && t.includes("/platform/requests"), t.slice(0, 800));
  check("χωρίς προσωπικά στοιχεία", !t.includes("6900002002"));
  await click(page, "Έλεγχος τώρα");
  await page.waitForTimeout(1500);
  t = await text(page);
  check("ο έλεγχος βρήκε τον λογαριασμό που κόλλησε", t.includes("Λογαριασμός χωρίς επιβεβαίωση πάνω από 3 μέρες"), t.slice(0, 800));
  check("ο ιδιοκτήτης πήρε ειδοποίηση",
    num(`select count(*) from notifications where kind = 'admin_health_issue'
          and user_id = (select id from users where phone_number = '+${"30" + ADMIN}')`) >= 1);

  await page.getByRole("button", { name: "Λύθηκε" }).first().click();
  await page.waitForTimeout(1200);
  check("«Λύθηκε» κλείνει ένα θέμα", num(`select count(*) from health_issues where status = 'resolved' and resolved_by is not null`) === 1);
});

// 3. Φάση 2: πήγαινε-έλα και βήματα ροής.
sql(`delete from health_events; delete from health_issues; delete from flow_events;`);
await as(CLIENT, async (page) => {
  for (let i = 0; i < 3; i++) {
    await go(page, "/platform/requests");
    await go(page, "/platform/wallet");
  }
  await go(page, "/platform/wallet/buy");
  await page.waitForTimeout(1000);
});
check("πήγαινε-έλα ανάμεσα σε δύο σελίδες: καταγράφηκε",
  num(`select count(*) from health_issues where code = 'pingpong' and sample->>'detail' like '%/platform/requests%/platform/wallet%'`) === 1);
check("ροή αγοράς credits: καταγράφηκε το άνοιγμα, χωρίς προσωπικά στοιχεία",
  num(`select count(*) from flow_events where flow = 'topup' and step = 'open'`) === 1);
await as(ADMIN, async (page) => {
  await go(page, "/platform/admin/health");
  const t = await text(page);
  check("η σελίδα δείχνει τις ροές", t.includes("Αγορά credits") && /1 ξεκίνησαν · 0 ολοκλήρωσαν/.test(t), t.slice(0, 900));
  check("και το πήγαινε-έλα", t.includes("Χρήστες πηγαινοέρχονται ανάμεσα σε δύο σελίδες"));
});

// Επαναφορά για τα επόμενα σενάρια.
trusted(`update users set phone_verified_at = now() where phone_number = '+306900002005'`);
sql(`delete from health_events; delete from health_issues; delete from flow_events;
     delete from notifications where kind = 'admin_health_issue';`);

finish();
