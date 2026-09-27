// Admin → Ghost → «Δημιουργία δοκιμαστικών λογαριασμών»: seven demo accounts
// on test phones, complete enough to use — professionals with availability
// and boat types, findable by test accounts and invisible to real ones.
import { as, go, text, click, check, finish, sql, iso, daysFromToday } from "./lib.mjs";

const demoPros = () => sql("select count(*) from skipper_profiles sp join users u on u.id = sp.user_id where u.phone_number like '+3069800000%'");
// What a given person's search returns, run as that person.
const searchAs = (userId, regionId, boatId) => sql(
  `select set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated"}', false);` +
  `select string_agg(u.full_name, ', ' order by u.full_name) from search_available_skippers(` +
  `'${iso(daysFromToday(20))}', '${iso(daysFromToday(23))}', '${regionId}', '${boatId}') s ` +
  `join skipper_profiles sp on sp.id = s.id join users u on u.id = sp.user_id`
).split("\n").pop();

await as("6900002001", async (page) => {
  await go(page, "/platform/admin/ghost");
  await click(page, "Δημιουργία δοκιμαστικών λογαριασμών");
  await page.waitForTimeout(4000);
  const body = await text(page);
  check("δημιουργήθηκαν 7, χωρίς αποτυχίες", body.includes("Δημιουργήθηκαν 7") && !body.includes("Απέτυχαν"), body.slice(body.indexOf("Δημιουργ"), body.indexOf("Δημιουργ") + 400));

  await click(page, "Δημιουργία δοκιμαστικών λογαριασμών");
  await page.waitForTimeout(3000);
  check("δεύτερο πάτημα: δεν φτιάχνει διπλούς", (await text(page)).includes("Υπήρχαν ήδη: 7") && demoPros() === "5");
});

check("οι επαγγελματίες έχουν προφίλ, διαθεσιμότητα και τύπους σκάφους", sql(
  "select count(*) from skipper_profiles sp join users u on u.id = sp.user_id " +
  "where u.phone_number like '+3069800000%' and exists (select 1 from availability_windows w where w.skipper_id = sp.id) " +
  "and exists (select 1 from skipper_boat_types b where b.skipper_id = sp.id)") === "5");
check("το φύλο γράφεται όπως το περιμένει η αναζήτηση", sql(
  "select string_agg(distinct gender, ',' order by gender) from skipper_profiles sp join users u on u.id = sp.user_id where u.phone_number like '+3069800000%'") === "female,male");

const demoClient = sql("select id from users where phone_number = '+306980000009'");
const realClient = sql("select id from users where full_name = 'Μαρία Πελάτη'");
// A region the demo professionals cover.
const region = sql("select r.region_id from availability_window_regions r join availability_windows w on w.id = r.window_id " +
  "join skipper_profiles sp on sp.id = w.skipper_id join users u on u.id = sp.user_id where u.phone_number = '+306980000004' limit 1");
const boat = sql("select b.boat_type_id from skipper_boat_types b join skipper_profiles sp on sp.id = b.skipper_id " +
  "join users u on u.id = sp.user_id where u.phone_number = '+306980000004' limit 1");
const seenByDemo = searchAs(demoClient, region, boat);
check("ο demo πελάτης βρίσκει τους demo επαγγελματίες (και μόνο αυτούς)",
  seenByDemo.includes("Γιώργος Αντωνίου") && !seenByDemo.includes("Υποψήφιος"), seenByDemo);
check("ο πραγματικός πελάτης δεν τους βλέπει ποτέ", !searchAs(realClient, region, boat).includes("Γιώργος Αντωνίου"));

await as("6980000009", async (page) => {
  await go(page, "/platform/wallet");
  // Δώρο εγγραφής για πελάτες: από τις Ρυθμίσεις, σήμερα 0 (0110).
  check("ο demo πελάτης μπαίνει με PIN και βλέπει τα credits του", (await text(page)).includes("0 credits"));
});

finish();
