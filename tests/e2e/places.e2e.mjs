// «Από πού ξεκινά το ταξίδι;» (0119): ο πελάτης γράφει ό,τι ξέρει, με λάθη,
// διαλέγει από προτάσεις, και η περιοχή προκύπτει μόνη της. Δεν μένει ποτέ
// σε αδιέξοδο: ό,τι δεν βρίσκεται → διαλέγει περιοχή, και ο ιδιοκτήτης το βλέπει.
import { as, go, text, check, finish, sql, num, pickDay, daysFromToday, pickPlace, shoot } from "./lib.mjs";

const MARIA = "6900002002", ADMIN = "6900002001";
const cyclades = sql(`select id from regions where name = 'Κυκλάδες'`);
sql(`delete from place_search_misses`);

const combobox = (page) => page.getByRole("combobox").first();
const options = async (page) => (await page.getByRole("option").allInnerTexts()).map((t) => t.split("\n")[0].trim());

await as(MARIA, async (page) => {
  // ---- Οδηγός: ρόλος → χώρα → «από πού» → ημερομηνίες ----
  await go(page, "/platform");
  await page.locator("button.sf-cta").click();
  await page.getByRole("button", { name: /^Skipper/ }).click();
  await page.getByRole("button", { name: "Συνέχεια" }).click();
  await page.waitForTimeout(400);

  let t = await text(page);
  check("πρώτα η χώρα, σε δική της σελίδα", t.includes("Ποια χώρα;") && !t.includes("Προς"));
  await shoot(page, "wizard-country");
  await page.getByRole("button", { name: "Ελλάδα", exact: true }).click();
  await page.waitForTimeout(400);
  t = await text(page);
  check("μετά το μέρος (όχι περιοχή / λιμάνι ξεχωριστά)", t.includes("Πού;") && t.includes("Από") && t.includes("Προς") && !t.includes("Ποια περιοχή;"));
  await shoot(page, "wizard-where-empty");
  const bases = (await page.locator("[data-base-ports] .sf-pp-name").allInnerTexts()).map((x) => x.trim());
  check("βασικά λιμάνια: η λίστα του ιδιοκτήτη, με τη σειρά της",
    bases.join(",") === "Άλιμος,Λαύριο,Λευκάδα,Πρέβεζα,Κέρκυρα,Κως,Ρόδος,Σκιάθος,Βόλος,Πάρος,Μύκονος,Ζάκυνθος", bases.join(","));
  check("χωρίς εσωτερικούς όρους στη σελίδα", !/προτεινόμεν/i.test(await text(page)));
  await page.locator("[data-base-ports] .sf-pp-row").filter({ hasText: "Gouvia Marina" }).click();
  t = await text(page);
  check("Κέρκυρα – Gouvia: νησί στο πεδίο «Από» και λιμάνι επιλεγμένο",
    (await page.locator("[data-route-field=from] [data-place-title]").innerText()) === "Κέρκυρα" && (await page.getByRole("button", { name: "Gouvia Marina", exact: true }).getAttribute("aria-pressed")) === "true", t.slice(0, 300));
  await page.locator("[data-route-field=from] button").first().click();
  check("το πεδίο έχει ήδη την εστίαση", await combobox(page).evaluate((el) => el === document.activeElement));
  check("χωρίς περιοχή δεν συνεχίζει", await page.getByRole("button", { name: "Συνέχεια" }).isDisabled());

  // Πόρος / Πάρος: δείχνει και τα δύο, δεν διαλέγει μόνο του.
  await combobox(page).fill("ποροσ");
  let names = await options(page);
  check("«ποροσ» → Πόρος πρώτος, και η Πάρος στις επιλογές", names[0] === "Πόρος" && names.includes("Πάρος"), names.join(", "));
  check("τίποτα δεν επιλέχτηκε αυτόματα", await page.getByRole("button", { name: "Συνέχεια" }).isDisabled());
  await shoot(page, "wizard-typing");

  // Λάθος γραφή → σωστό μέρος, με την περιοχή του.
  await pickPlace(page, "παρωσ", "Πάρος");
  t = await text(page);
  check("Πάρος στο πεδίο «Από»", (await page.locator("[data-route-field=from] [data-place-title]").innerText()) === "Πάρος", t.slice(0, 300));
  check("λιμάνια της Πάρου, με «Όπου βολεύει» προεπιλεγμένο",
    t.includes("Νάουσα") && (await page.getByRole("button", { name: "Όπου βολεύει" }).getAttribute("aria-pressed")) === "true");
  check("ενημέρωση για την περιοχή", t.includes("Επαγγελματίες διαθέσιμοι στις Κυκλάδες."));
  await shoot(page, "wizard-selected");
  await page.getByRole("button", { name: "Νάουσα", exact: true }).click();
  check("επιλογή λιμανιού", (await page.getByRole("button", { name: "Νάουσα", exact: true }).getAttribute("aria-pressed")) === "true");

  // Όσο αλλάζει το μέρος, δεν προχωρά με την παλιά επιλογή· Esc = ακύρωση.
  await page.locator("[data-route-field=from] button").first().click();
  check("στη μέση αλλαγής δεν συνεχίζει", await page.getByRole("button", { name: "Συνέχεια" }).isDisabled());
  await combobox(page).press("Escape");
  check("Esc κρατά την προηγούμενη επιλογή",
    (await page.locator("[data-place-title]").first().innerText()) === "Πάρος" &&
      (await page.getByRole("button", { name: "Νάουσα", exact: true }).getAttribute("aria-pressed")) === "true");

  // Τέλος σε άλλο σημείο: ελεύθερο, με προτάσεις.
  await page.locator("[data-route-field=to] button").first().click();
  await page.getByRole("combobox").fill("mikonos");
  await page.getByRole("option", { name: /^Μύκονος/ }).click();
  check("πεδίο «Προς»: Μύκονος, με καρφίτσες Α και Β στον ίδιο χάρτη",
    (await page.locator("[data-route-field=to] [data-place-title]").innerText()) === "Μύκονος" && (await page.locator("[data-choice-map]").count()) === 1);
  await page.getByRole("button", { name: "Συνέχεια" }).click();
  await page.waitForTimeout(400);

  // Ημερολόγιο μετά το μέρος· η ενέργεια φαίνεται χωρίς κύλιση, και σε κινητό.
  check("το ημερολόγιο έρχεται μετά το μέρος", (await text(page)).includes("Πότε;"));
  await page.setViewportSize({ width: 390, height: 740 });
  await pickDay(page, daysFromToday(40));
  await pickDay(page, daysFromToday(43));
  const inView = await page.getByRole("button", { name: "Συνέχεια" }).evaluate((b) => {
    const r = b.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight;
  });
  check("«Συνέχεια» ορατό στην οθόνη του κινητού χωρίς κύλιση", inView);
  await shoot(page, "wizard-dates");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Συνέχεια" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Ιστιοπλοϊκό" }).click();
  await page.waitForTimeout(300);
  // Σκάφος: μάρκα → μοντέλο → πόδια (chips, ένα πάτημα προχωρά· τα πόδια προτείνονται από το μοντέλο).
  check("βήμα μάρκας: chips με τις συνηθισμένες του ιστιοπλοϊκού", (await text(page)).includes("Τι μάρκα;") && (await text(page)).includes("Bavaria") && (await text(page)).includes("Dehler") && !(await text(page)).includes("Lagoon"));
  await shoot(page, "wizard-brand");
  await page.getByRole("button", { name: "Bavaria", exact: true }).click();
  await page.waitForTimeout(300);
  check("βήμα μοντέλου: προτάσεις της μάρκας", (await text(page)).includes("Ποιο μοντέλο;") && (await text(page)).includes("Cruiser 46"));
  await page.getByPlaceholder("Γράψε μοντέλο").fill("c45");
  check("αναζήτηση μοντέλου με πρόταση από κάτω", await page.getByRole("option", { name: "C45" }).isVisible());
  await page.getByPlaceholder("Γράψε μοντέλο").fill("");
  await page.getByRole("button", { name: "Cruiser 46", exact: true }).click();
  await page.waitForTimeout(300);
  check("βήμα ποδιών: προτείνει 46 από το μοντέλο", (await text(page)).includes("Πόσα πόδια;") && (await page.getByRole("button", { name: "46 πόδια" }).isVisible()));
  await page.getByRole("button", { name: "46 πόδια" }).click();
  await page.getByRole("button", { name: "Συνέχεια" }).click();
  await page.waitForTimeout(300);
  check("στις τελευταίες λεπτομέρειες δεν υπάρχει πια μοντέλο ή μήκος", !(await page.locator("#wz-boat-model").count()) && !(await page.locator("#wz-boat-length").count()));
  check("επιβάτες: μία ερώτηση, μεγάλος μετρητής", (await text(page)).includes("Πόσοι επιβάτες θα είστε;") && (await page.locator("[data-counter] output").innerText()).trim() === "2");
  await page.getByRole("button", { name: "Περισσότερο" }).click();
  await page.getByRole("button", { name: "Περισσότερο" }).click();
  check("ο μετρητής πάει στο 4", (await page.locator("[data-counter] output").innerText()).trim() === "4");
  await page.getByRole("button", { name: "Συνέχεια" }).click();
  await page.waitForTimeout(300);
  const chosen = () => page.locator("[data-language-picker] button[aria-pressed=true]").count();
  const before = await chosen();
  check("γλώσσες: «Ποιες γλώσσες μιλάς;» με κάποιες ήδη επιλεγμένες (τικ)", (await text(page)).includes("Ποιες γλώσσες μιλάς;") && before >= 1);
  await shoot(page, "wizard-language");
  await page.getByRole("button", { name: "Περισσότερες γλώσσες" }).click();
  await page.locator("[data-language-list]").getByRole("button", { name: "Πολωνικά", exact: true }).click();
  check("η Πολωνική προστέθηκε στις επιλεγμένες", (await page.getByRole("button", { name: "Πολωνικά", exact: true }).getAttribute("aria-pressed")) === "true" && (await chosen()) === before + 1);
  await page.getByRole("button", { name: "Συνέχεια" }).click();
  await page.waitForTimeout(300);
  check("καμπίνα: τρεις επιλογές, μία ερώτηση", (await text(page)).includes("Πού θα κοιμάται ο επαγγελματίας;") && (await page.locator("[data-cabin-choice] button").count()) === 3);
  await shoot(page, "wizard-cabin");
  await page.locator("[data-cabin-choice]").getByRole("button", { name: "Καμπίνα σκίπερ" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Ολοκλήρωση" }).click();
  await page.waitForURL(/\/platform\/search\?/);
  const url = new URL(page.url());
  check("η αναζήτηση πήρε την περιοχή από το μέρος", url.searchParams.get("region") === cyclades, url.search);
  check("σημείο αναχώρησης «Νάουσα (Πάρος)»", url.searchParams.get("point") === "Νάουσα (Πάρος)", url.searchParams.get("point"));
  check("τερματισμός «Μύκονος»", url.searchParams.get("arrival") === "Μύκονος");
  check("γλώσσες στο URL: όσες επιλέχτηκαν, με την Πολωνική", (url.searchParams.get("lang") || "").split(",").filter(Boolean).length >= 2, url.search);
  check("καμπίνα σκίπερ στο URL", url.searchParams.get("cabin") === "skipper", url.search);
  check("σκάφος «Bavaria Cruiser 46», 46 πόδια", url.searchParams.get("bm") === "Bavaria Cruiser 46" && url.searchParams.get("bl") === "46", url.search);
  await page.waitForTimeout(1500);
  t = await text(page);
  check("σύνοψη: μέρος πρώτα, μετά περιοχή", t.includes("Νάουσα (Πάρος) → Μύκονος · Κυκλάδες"), t.slice(0, 400));

  // ---- Φίλτρα αποτελεσμάτων: η ίδια επιλογή ξαναφαίνεται όπως επιλέχτηκε ----
  await page.getByRole("button", { name: "Αλλαγή", exact: true }).first().click();
  await page.waitForTimeout(300);
  t = await text(page);
  check("τα φίλτρα δείχνουν «Πάρος» με τη Νάουσα επιλεγμένη",
    (await page.locator("[data-place-title]").first().innerText()) === "Πάρος" &&
      (await page.getByRole("button", { name: "Νάουσα", exact: true }).getAttribute("aria-pressed")) === "true");

  // ---- Μέρος που δεν υπάρχει: χωρίς αδιέξοδο ----
  await go(page, "/platform/search");
  await combobox(page).fill("Γκιόκοβα");
  await page.waitForTimeout(200);
  t = await text(page);
  check("δεν βρέθηκε → ρωτά την περιοχή", t.includes("Δεν το βρήκαμε στη λίστα. Σε ποια περιοχή είναι το «Γκιόκοβα»;"), t.slice(0, 300));
  await shoot(page, "search-unlisted");
  await page.locator("[data-place-picker=unlisted] button").filter({ hasText: "Δωδεκάνησα" }).click();
  await page.waitForTimeout(800);
  check("κρατά ό,τι έγραψε, με την περιοχή", (await page.locator("[data-place-title]").first().innerText()) === "Γκιόκοβα" && (await text(page)).includes("Δωδεκάνησα · Ελλάδα"));

  // ---- Πόλεις χωρίς επαγγελματίες ακόμα: τις βρίσκει, ενημερώνεται, δεν κολλάει ----
  await page.getByRole("button", { name: "Αλλαγή", exact: true }).first().click();
  await pickPlace(page, "salonica", "Θεσσαλονίκη");
  t = await text(page);
  check("Θεσσαλονίκη: βρέθηκε αλλά χωρίς επαγγελματίες ακόμα", t.includes("Δεν έχουμε ακόμα επαγγελματίες σε αυτή την περιοχή.") && t.includes("Βόρειο Αιγαίο"), t.slice(0, 300));
  await shoot(page, "search-uncovered");
  await page.locator("[data-place-picker=uncovered] button").filter({ hasText: "Σποράδες" }).click();
  check("κρατά «Θεσσαλονίκη» με κοντινή περιοχή τις Σποράδες",
    (await page.locator("[data-place-title]").first().innerText()) === "Θεσσαλονίκη" && (await text(page)).includes("Σποράδες · Ελλάδα"));

  // ---- Πόλεις που ζήτησε ο ιδιοκτήτης: η περιοχή προκύπτει ----
  await page.getByRole("button", { name: "Αλλαγή", exact: true }).first().click();
  await pickPlace(page, "καλαματα", "Καλαμάτα");
  check("Καλαμάτα → Ιόνιο", (await text(page)).includes("Ιόνιο · Ελλάδα"));
  await page.getByRole("button", { name: "Αλλαγή", exact: true }).first().click();
  await pickPlace(page, "patra", "Πάτρα");
  check("Πάτρα → Ιόνιο", (await text(page)).includes("Ιόνιο · Ελλάδα"));
  await page.getByRole("button", { name: "Αλλαγή", exact: true }).first().click();
  await pickPlace(page, "σαλαμινα", "Σαλαμίνα");
  check("Σαλαμίνα → Σαρωνικός (ο επαγγελματίας του Σαρωνικού την καλύπτει)", (await text(page)).includes("Σαρωνικός · Ελλάδα"));

  // ---- «Ελλάδα» → περιοχές → οπουδήποτε στο Ιόνιο ----
  await page.getByRole("button", { name: "Αλλαγή", exact: true }).first().click();
  await pickPlace(page, "ελλαδα", "Ελλάδα");
  check("«Ελλάδα» ανοίγει τις περιοχές", await page.locator("[data-place-picker=browse]").isVisible());
  await page.getByRole("button", { name: /^Κυκλάδες/ }).click();
  await shoot(page, "search-browse");
  await page.getByRole("button", { name: /^Κυκλάδες/ }).click();
  await page.getByRole("button", { name: /^Ιόνιο/ }).click();
  await page.getByRole("button", { name: "Οπουδήποτε στο Ιόνιο" }).click();
  t = await text(page);
  check("όλη η περιοχή", (await page.locator("[data-place-title]").first().innerText()) === "Ιόνιο" && t.includes("Όλη η περιοχή"));

  // ---- Πληκτρολόγιο: Enter διαλέγει την επισημασμένη πρόταση ----
  await page.getByRole("button", { name: "Αλλαγή", exact: true }).first().click();
  await combobox(page).fill("κερκηρα");
  await combobox(page).press("Enter");
  check("Enter → Κέρκυρα", (await page.locator("[data-place-title]").first().innerText()) === "Κέρκυρα");
});

check("η Θεσσαλονίκη καταγράφηκε ως ζήτηση εκτός κάλυψης", num(`select count(*) from place_search_misses where query = 'Θεσσαλονίκη' and region_id is null`) === 1);
check("το «Γκιόκοβα» καταγράφηκε μία φορά, στα Δωδεκάνησα",
  num(`select count(*) from place_search_misses m join regions r on r.id = m.region_id where m.query = 'Γκιόκοβα' and r.name = 'Δωδεκάνησα'`) === 1);

await as(ADMIN, async (page) => {
  await go(page, "/platform/admin/health");
  const t = await text(page);
  check("ο ιδιοκτήτης βλέπει τι δεν βρέθηκε", t.includes("Γκιόκοβα") && t.includes("1×"), t.slice(0, 600));
});

sql(`delete from place_search_misses`);
finish();
