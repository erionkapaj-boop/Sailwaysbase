// Διαθεσιμότητα σε περιόδους ανά περιοχή, όπως τη δηλώνει ο επαγγελματίας:
// Ιόνιο τον έναν μήνα, Σαρωνικός μετά, και «την άλλη εβδομάδα Κυκλάδες»
// πάνω στο Ιόνιο. Αλλαγή και διαγραφή περιόδου από τη λίστα.
import { as, go, text, click, check, finish, sql, num, daysFromToday } from "./lib.mjs";

const NIKOS = "6900002003", SP = "b0000000-0000-0000-0000-000000000003";
const SHOTS = process.env.E2E_SHOTS || "";
const regionsOn = (n) =>
  sql(`select coalesce(string_agg(r.name, ',' order by r.name), '-') from availability_windows w
        join availability_window_regions wr on wr.window_id = w.id join regions r on r.id = wr.region_id
       where w.skipper_id = '${SP}' and current_date + ${n} between w.start_date and w.end_date`);
const saved = sql(`select coalesce(json_agg(json_build_object('s', start_date, 'e', end_date, 'r',
  (select json_agg(region_id) from availability_window_regions where window_id = w.id))), '[]') from availability_windows w where skipper_id = '${SP}'`);
sql(`delete from availability_windows where skipper_id = '${SP}'`);

const MONTH_GEN = ["Ιανουαρίου", "Φεβρουαρίου", "Μαρτίου", "Απριλίου", "Μαΐου", "Ιουνίου",
  "Ιουλίου", "Αυγούστου", "Σεπτεμβρίου", "Οκτωβρίου", "Νοεμβρίου", "Δεκεμβρίου"];
// Ίδιο με το pickDay του lib, αλλά μέσα στο παράθυρο (όχι στο ημερολόγιο της σελίδας).
async function pickIn(page, dlg, date) {
  const label = `${date.getDate()} ${MONTH_GEN[date.getMonth()]} ${date.getFullYear()}`;
  const target = dlg.locator(`button.sf-cal-day[aria-label="${label}"]`);
  for (let i = 0; i < 4 && !(await target.count()); i++) {
    await dlg.getByRole("button", { name: "Επόμενος μήνας" }).first().click();
    await page.waitForTimeout(250);
  }
  await target.first().click();
}

async function newPeriod(page, from, to, regionsToPick) {
  await click(page, "+ Νέα περίοδος");
  await page.waitForTimeout(400);
  const dlg = page.getByRole("dialog");
  await pickIn(page, dlg, daysFromToday(from));
  await pickIn(page, dlg, daysFromToday(to));
  for (const r of regionsToPick) await dlg.getByRole("button", { name: r }).click();
}

await as(NIKOS, async (page) => {
  await go(page, "/platform/availability");
  check("χωρίς περιόδους: το λέει", (await text(page)).includes("Δεν έχεις δηλώσει περιόδους"));

  await newPeriod(page, 10, 30, ["Ιόνιο"]);
  await click(page, "Αποθήκευση");
  await page.waitForTimeout(1500);
  await newPeriod(page, 32, 45, ["Σαρωνικός"]);
  await click(page, "Αποθήκευση");
  await page.waitForTimeout(1500);
  check("δύο περίοδοι, δύο περιοχές", regionsOn(15) === "Ιόνιο" && regionsOn(40) === "Σαρωνικός" && regionsOn(31) === "-");
  let t = await text(page);
  check("η λίστα δείχνει και τις δύο με την περιοχή τους", t.includes("Ιόνιο") && t.includes("Σαρωνικός") && /ΟΙ ΠΕΡΙΟΔΟΙ ΜΟΥ|Οι περίοδοί μου/.test(t));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/after-two.png`, fullPage: true });

  // «Την άλλη εβδομάδα θα είμαι στις Κυκλάδες»: πάνω στο Ιόνιο.
  await newPeriod(page, 18, 22, ["Κυκλάδες"]);
  await page.waitForTimeout(300);
  const dlgText = await page.getByRole("dialog").innerText();
  check("πριν την αποθήκευση λέει τι αλλάζει", dlgText.includes("Ιόνιο → Κυκλάδες"), dlgText);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/override-preview.png` });
  await click(page, "Αποθήκευση");
  await page.waitForTimeout(1500);
  check("Ιόνιο πριν και μετά, Κυκλάδες στη μέση",
    regionsOn(17) === "Ιόνιο" && regionsOn(18) === "Κυκλάδες" && regionsOn(22) === "Κυκλάδες" && regionsOn(23) === "Ιόνιο");
  t = await text(page);
  check("η λίστα έχει τώρα 4 περιόδους", (t.match(/Ιόνιο/g) || []).length >= 2 && t.includes("Κυκλάδες"));

  // Αλλαγή περιόδου από τη λίστα: ο Σαρωνικός γίνεται και Κυκλάδες.
  await page.getByRole("button", { name: /Σαρωνικός/ }).last().click();
  await page.waitForTimeout(500);
  check("ανοίγει «Αλλαγή περιόδου»", (await page.getByRole("dialog").innerText()).includes("ΑΛΛΑΓΗ ΠΕΡΙΟΔΟΥ") ||
    (await page.getByRole("dialog").innerText()).includes("Αλλαγή περιόδου"));
  await page.getByRole("dialog").getByRole("button", { name: "Κυκλάδες" }).click();
  await click(page, "Αποθήκευση");
  await page.waitForTimeout(1500);
  check("η περίοδος άλλαξε, χωρίς διπλή", regionsOn(40) === "Κυκλάδες,Σαρωνικός" &&
    num(`select count(*) from availability_windows where skipper_id = '${SP}' and current_date + 40 between start_date and end_date`) === 1);

  // Απουσία από το ίδιο παράθυρο, πάνω σε δηλωμένο Ιόνιο.
  await click(page, "+ Νέα περίοδος");
  await page.waitForTimeout(400);
  const dlgA = page.getByRole("dialog");
  await pickIn(page, dlgA, daysFromToday(24));
  await pickIn(page, dlgA, daysFromToday(26));
  await dlgA.getByRole("radio", { name: "Απουσία" }).click();
  await page.waitForTimeout(300);
  check("απουσία: λέει ποιες μέρες του Ιονίου κλείνουν", (await dlgA.innerText()).includes("Ιόνιο → Απουσία"));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/absence.png` });
  await click(page, "Αποθήκευση");
  await page.waitForTimeout(1500);
  check("η απουσία μπήκε, το Ιόνιο μένει από κάτω",
    num(`select count(*) from availability_blocks where skipper_id = '${SP}' and start_date = current_date + 24 and end_date = current_date + 26`) === 1 &&
    regionsOn(25) === "Ιόνιο");
  // Ακύρωση της απουσίας από τη λίστα.
  await page.getByRole("button", { name: /Απουσία/ }).last().click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Ακύρωση απουσίας" }).click();
  await page.waitForTimeout(1500);
  check("ακύρωση απουσίας: οι μέρες ξανανοίγουν", num(`select count(*) from availability_blocks where skipper_id = '${SP}'`) === 0);

  // «Όλες» οι περιοχές με ένα πάτημα.
  await newPeriod(page, 50, 52, []);
  await page.getByRole("dialog").getByRole("button", { name: "Όλες" }).click();
  await click(page, "Αποθήκευση");
  await page.waitForTimeout(1500);
  check("«Όλες»: όλες οι περιοχές", num(`select count(*) from availability_window_regions wr join availability_windows w on w.id = wr.window_id
    where w.skipper_id = '${SP}' and w.start_date = current_date + 50`) === num("select count(*) from regions"));

  // Διαγραφή περιόδου.
  await page.getByRole("button", { name: /Κυκλάδες · Σαρωνικός/ }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Διαγραφή περιόδου" }).click();
  await page.waitForTimeout(1500);
  check("η περίοδος διαγράφηκε", regionsOn(40) === "-");
  if (SHOTS) {
    await go(page, "/platform/availability");
    await page.getByRole("button", { name: "Επόμενος μήνας" }).first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/final.png`, fullPage: true });
  }
});

// Επαναφορά.
sql(`delete from availability_windows where skipper_id = '${SP}';
     delete from availability_blocks where skipper_id = '${SP}';
     with src as (select * from json_to_recordset('${saved}'::json) as x(s date, e date, r json)),
     ins as (insert into availability_windows (skipper_id, start_date, end_date) select '${SP}', s, e from src returning id, start_date, end_date)
     insert into availability_window_regions (window_id, region_id)
       select ins.id, (jsonb_array_elements_text(src.r::jsonb))::uuid from ins join src on src.s = ins.start_date and src.e = ins.end_date;`);
finish();
