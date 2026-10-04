// «Προβολή ως χρήστης» (μόνο ανάγνωση): ο ιδιοκτήτης βλέπει τα αιτήματα και τις
// ειδοποιήσεις του χρήστη χωρίς να μπορεί να αλλάξει τίποτα, και χωρίς κανένα
// ανεπεξέργαστο σφάλμα (Υγεία: unhandled_promise@/platform/requests).
import { as, go, text, check, finish, sql } from "./lib.mjs";

const ADMIN = "6900002001", NIKOS = "6900002003";
const nikosId = sql(`select id from users where phone_number = '+30${NIKOS}'`);
// Μία αδιάβαστη ειδοποίηση, ώστε το κουδούνι να έχει κάτι να «διαβάσει».
sql(`insert into notifications (user_id, kind, data) values ('${nikosId}', 'welcome', '{}'::jsonb)`);

await as(ADMIN, async (page) => {
  await page.addInitScript((id) => {
    sessionStorage.setItem("sf_view_as", JSON.stringify({ id, name: "Νίκος Αρχικός", phone: "+306900002003", role: "skipper" }));
  }, nikosId);
  await go(page, "/platform/requests");
  const t = await text(page);
  check("δείχνει ότι βλέπει ως τον χρήστη", t.includes("Μόνο ανάγνωση"), t.slice(0, 200));
  const bell = page.getByRole("button", { name: /^Ειδοποιήσεις \(\d+\)/ });
  check("το κουδούνι δείχνει αδιάβαστες του χρήστη", (await bell.count()) === 1);
  await bell.click();
  await page.waitForTimeout(800);
  check("δεν υπάρχει «Όλα ως διαβασμένα» σε προβολή μόνο-για-ανάγνωση",
    (await page.getByRole("button", { name: "Όλα ως διαβασμένα" }).count()) === 0);
});

finish();
