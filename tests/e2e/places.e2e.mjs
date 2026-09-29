// «Από πού ξεκινά το ταξίδι;» (0119): ο πελάτης γράφει ό,τι ξέρει, με λάθη,
// διαλέγει από προτάσεις, και η περιοχή προκύπτει μόνη της. Δεν μένει ποτέ
// σε αδιέξοδο: ό,τι δεν βρίσκεται → διαλέγει περιοχή, και ο ιδιοκτήτης το βλέπει.
import { as, go, text, check, finish, sql, num, pickDay, daysFromToday, pickPlace } from "./lib.mjs";

const MARIA = "6900002002", ADMIN = "6900002001";
const cyclades = sql(`select id from regions where name = 'Κυκλάδες'`);
sql(`delete from place_search_misses`);

const combobox = (page) => page.getByRole("combobox").first();
const options = async (page) => (await page.getByRole("option").allInnerTexts()).map((t) => t.split("\n")[0].trim());

await as(MARIA, async (page) => {
  // ---- Οδηγός: ρόλος → ημερομηνίες → «από πού» ----
  await go(page, "/platform");
  await page.locator("button.sf-cta").click();
  await page.getByRole("button", { name: /^Skipper/ }).click();
  await page.getByRole("button", { name: "Συνέχεια" }).click();
  await pickDay(page, daysFromToday(40));
  await pickDay(page, daysFromToday(43));
  await page.getByRole("button", { name: "Συνέχεια" }).click();
  await page.waitForTimeout(400);

  let t = await text(page);
  check("ένα βήμα για το «από πού» (όχι χώρα / περιοχή / λιμάνι)", t.includes("Από πού ξεκινά το ταξίδι;") && !t.includes("Ποια χώρα;"));
  check("γρήγορες επιλογές πριν γράψει", t.includes("Αθήνα") && t.includes("Πάρος"));
  check("το πεδίο έχει ήδη την εστίαση", await combobox(page).evaluate((el) => el === document.activeElement));
  check("χωρίς περιοχή δεν συνεχίζει", await page.getByRole("button", { name: "Συνέχεια" }).isDisabled());

  // Πόρος / Πάρος: δείχνει και τα δύο, δεν διαλέγει μόνο του.
  await combobox(page).fill("ποροσ");
  let names = await options(page);
  check("«ποροσ» → Πόρος πρώτος, και η Πάρος στις επιλογές", names[0] === "Πόρος" && names.includes("Πάρος"), names.join(", "));
  check("τίποτα δεν επιλέχτηκε αυτόματα", await page.getByRole("button", { name: "Συνέχεια" }).isDisabled());

  // Λάθος γραφή → σωστό μέρος, με την περιοχή του.
  await pickPlace(page, "παρωσ", "Πάρος");
  t = await text(page);
  check("Πάρος → Κυκλάδες · Ελλάδα", t.includes("Κυκλάδες · Ελλάδα"), t.slice(0, 300));
  check("λιμάνια της Πάρου, με «Όπου βολεύει» προεπιλεγμένο",
    t.includes("Νάουσα") && (await page.getByRole("button", { name: "Όπου βολεύει" }).getAttribute("aria-pressed")) === "true");
  check("ενημέρωση για την περιοχή", t.includes("Επαγγελματίες διαθέσιμοι στις Κυκλάδες."));
  await page.getByRole("button", { name: "Νάουσα", exact: true }).click();
  check("επιλογή λιμανιού", (await page.getByRole("button", { name: "Νάουσα", exact: true }).getAttribute("aria-pressed")) === "true");

  // Όσο αλλάζει το μέρος, δεν προχωρά με την παλιά επιλογή· Esc = ακύρωση.
  await page.getByRole("button", { name: "Αλλαγή" }).click();
  check("στη μέση αλλαγής δεν συνεχίζει", await page.getByRole("button", { name: "Συνέχεια" }).isDisabled());
  await combobox(page).press("Escape");
  check("Esc κρατά την προηγούμενη επιλογή",
    (await page.locator("[data-place-title]").first().innerText()) === "Πάρος" &&
      (await page.getByRole("button", { name: "Νάουσα", exact: true }).getAttribute("aria-pressed")) === "true");

  // Τέλος σε άλλο σημείο: ελεύθερο, με προτάσεις.
  await page.getByLabel("Τελειώνει σε άλλο σημείο").check();
  await page.getByRole("combobox").fill("mikonos");
  await page.getByRole("option", { name: /^Μύκονος/ }).click();
  await page.getByRole("button", { name: "Συνέχεια" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Ιστιοπλοϊκό" }).click();
  await page.waitForTimeout(300);
  await page.locator("input[type=number]").fill("4");
  await page.locator("select").nth(1).selectOption({ label: "Ναι" });
  await page.getByRole("button", { name: "Ολοκλήρωση" }).click();
  await page.waitForURL(/\/platform\/search\?/);
  const url = new URL(page.url());
  check("η αναζήτηση πήρε την περιοχή από το μέρος", url.searchParams.get("region") === cyclades, url.search);
  check("σημείο αναχώρησης «Νάουσα (Πάρος)»", url.searchParams.get("point") === "Νάουσα (Πάρος)", url.searchParams.get("point"));
  check("τερματισμός «Μύκονος»", url.searchParams.get("arrival") === "Μύκονος");
  await page.waitForTimeout(1500);
  t = await text(page);
  check("σύνοψη: μέρος πρώτα, μετά περιοχή", t.includes("Νάουσα (Πάρος) → Μύκονος · Κυκλάδες"), t.slice(0, 400));

  // ---- Φίλτρα αποτελεσμάτων: η ίδια επιλογή ξαναφαίνεται όπως επιλέχτηκε ----
  await page.getByRole("button", { name: "Αλλαγή" }).first().click();
  await page.waitForTimeout(300);
  t = await text(page);
  check("τα φίλτρα δείχνουν «Πάρος» με τη Νάουσα επιλεγμένη",
    (await page.locator("[data-place-title]").first().innerText()) === "Πάρος" &&
      (await page.getByRole("button", { name: "Νάουσα", exact: true }).getAttribute("aria-pressed")) === "true");

  // ---- Μέρος που δεν υπάρχει: χωρίς αδιέξοδο ----
  await go(page, "/platform/search");
  await combobox(page).fill("Μαρμαρίς");
  await page.waitForTimeout(200);
  t = await text(page);
  check("δεν βρέθηκε → ρωτά την περιοχή", t.includes("Δεν το βρήκαμε στη λίστα. Σε ποια περιοχή είναι το «Μαρμαρίς»;"), t.slice(0, 300));
  await page.locator("[data-place-picker=unlisted] button").filter({ hasText: "Δωδεκάνησα" }).click();
  await page.waitForTimeout(800);
  check("κρατά ό,τι έγραψε, με την περιοχή", (await page.locator("[data-place-title]").first().innerText()) === "Μαρμαρίς" && (await text(page)).includes("Δωδεκάνησα · Ελλάδα"));

  // ---- «Ελλάδα» → περιοχές → οπουδήποτε στο Ιόνιο ----
  await page.getByRole("button", { name: "Αλλαγή" }).first().click();
  await pickPlace(page, "ελλαδα", "Ελλάδα");
  check("«Ελλάδα» ανοίγει τις περιοχές", await page.locator("[data-place-picker=browse]").isVisible());
  await page.getByRole("button", { name: /^Ιόνιο/ }).click();
  await page.getByRole("button", { name: "Οπουδήποτε στο Ιόνιο" }).click();
  t = await text(page);
  check("όλη η περιοχή", (await page.locator("[data-place-title]").first().innerText()) === "Ιόνιο" && t.includes("Όλη η περιοχή"));

  // ---- Πληκτρολόγιο: Enter διαλέγει την επισημασμένη πρόταση ----
  await page.getByRole("button", { name: "Αλλαγή" }).first().click();
  await combobox(page).fill("κερκηρα");
  await combobox(page).press("Enter");
  check("Enter → Κέρκυρα", (await page.locator("[data-place-title]").first().innerText()) === "Κέρκυρα");
});

check("το «Μαρμαρίς» καταγράφηκε μία φορά, στα Δωδεκάνησα",
  num(`select count(*) from place_search_misses m join regions r on r.id = m.region_id where m.query = 'Μαρμαρίς' and r.name = 'Δωδεκάνησα'`) === 1);

await as(ADMIN, async (page) => {
  await go(page, "/platform/admin/health");
  const t = await text(page);
  check("ο ιδιοκτήτης βλέπει τι δεν βρέθηκε", t.includes("Μαρμαρίς") && t.includes("1×"), t.slice(0, 600));
});

sql(`delete from place_search_misses`);
finish();
