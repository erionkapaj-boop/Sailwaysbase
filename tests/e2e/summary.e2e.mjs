// Σύνοψη πριν τα αποτελέσματα: όλο το αίτημα σε γραμμές (εικονίδιο + λίγες λέξεις). Πάτημα σε γραμμή → η
// αντίστοιχη οθόνη και επιστροφή στη σύνοψη χωρίς να χαθεί τίποτα. Κάτω, «+ Άλλη γλώσσα;» (τα Αγγλικά
// θεωρούνται δεδομένα). Ελληνικά και αγγλικά.
import { BASE, as, go, text, check, finish, sql, pickDay, daysFromToday, shoot } from "./lib.mjs";

const MARIA = "a0000000-0000-0000-0000-000000000002";
const locale0 = sql(`select coalesce(locale, '') from users where id = '${MARIA}'`);

await as("6900002002", async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const cont = () => page.locator(".sf-step-footer button").first();
  const row = (k) => page.locator(`[data-summary-row="${k}"]`);
  const rowText = async (k) => (await row(k).innerText()).replace(/\s+/g, " ").trim();
  await go(page, "/platform");
  await page.locator("button.sf-cta").click();
  await page.getByRole("button", { name: "Ελλάδα", exact: true }).click();
  await page.waitForTimeout(1500);
  await cont().click(); await page.waitForTimeout(600);
  await pickDay(page, daysFromToday(12)); await pickDay(page, daysFromToday(15)); await cont().click(); await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Περισσότερο" }).click(); // 3 επιβάτες
  await cont().click(); await page.waitForTimeout(600);
  await page.locator("[data-boat-unknown]").click(); await page.waitForTimeout(600);
  await page.locator('[data-role-card="skipper"]').click();
  await page.locator('[data-role-card="hostess"]').click();
  await page.locator('[data-role-count="hostess"] button').last().click();
  await cont().click(); await page.waitForTimeout(500);
  const pick = async (name) => { await page.locator("[data-cabin-choice]").getByRole("button", { name, exact: true }).click(); await page.waitForTimeout(450); };
  await pick("Κουκέτα");          // skipper
  await pick("Ιδιωτική καμπίνα"); // hostess 1
  await pick("Δεν ξέρω ακόμα");   // hostess 2

  // ---- Η σύνοψη ----
  let t = await text(page);
  check("σύνοψη μετά την τελευταία ερώτηση, με τίτλο «Σύνοψη»", (await page.locator("[data-summary]").count()) === 1 && t.includes("Σύνοψη"), t.slice(0, 200));
  check("γραμμή χώρας και λιμανιού", (await rowText("where")).includes("Ελλάδα") && (await rowText("where")).includes("Άλιμος"), await rowText("where"));
  check("γραμμή επιβατών: 3 επιβάτες", (await rowText("party")).includes("3 επιβάτες"), await rowText("party"));
  check("γραμμή σκάφους: «Σκάφος: δεν έχει οριστεί»", (await rowText("boat")).includes("Σκάφος: δεν έχει οριστεί"));
  check("γραμμή ρόλων: Skipper, Hostess ×2", (await rowText("roles")).includes("Skipper") && (await rowText("roles")).includes("Hostess ×2"), await rowText("roles"));
  check("διαμονή ανά ρόλο, ανά θέση", (await rowText("cabin-skipper")).includes("Κουκέτα") && (await rowText("cabin-hostess")).includes("Ιδιωτική καμπίνα / Αδιευκρίνιστη"), await rowText("cabin-hostess"));
  check("κάθε γραμμή έχει εικονίδιο", (await page.locator("[data-summary-row] svg").count()) >= 6);
  check("«+ Άλλη γλώσσα;» υπάρχει, χωρίς επιλογή Αγγλικών", (await page.locator("[data-language-link]").innerText()).includes("+ Άλλη γλώσσα;") && (await page.locator("[data-language]").count()) === 0);
  await shoot(page, "summary");

  // ---- Αλλαγή επιβατών και επιστροφή ----
  await row("party").click(); await page.waitForTimeout(500);
  check("πάτημα στην γραμμή: ανοίγει η οθόνη επιβατών", (await text(page)).includes("Πόσοι επιβάτες θα είστε;"));
  await page.getByRole("button", { name: "Περισσότερο" }).click();
  await cont().click(); await page.waitForTimeout(500);
  check("επιστροφή στη σύνοψη με 4 επιβάτες, τα υπόλοιπα όπως ήταν", (await rowText("party")).includes("4 επιβάτες") && (await rowText("roles")).includes("Hostess ×2") && (await rowText("cabin-hostess")).includes("Ιδιωτική καμπίνα / Αδιευκρίνιστη"));

  // ---- Αλλαγή σκάφους (όλη η ομάδα οθονών) ----
  await row("boat").click(); await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Ιστιοπλοϊκό" }).click(); await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Bavaria", exact: true }).click(); await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Cruiser 46", exact: true }).click(); await page.waitForTimeout(400);
  await page.getByRole("button", { name: "46 πόδια" }).click();
  await cont().click(); await page.waitForTimeout(400);
  check("έτος: ακόμα μέσα στην αλλαγή σκάφους", (await text(page)).includes("Έτος κατασκευής"));
  await page.getByRole("button", { name: "Παράλειψη" }).click(); await page.waitForTimeout(500);
  check("επιστροφή στη σύνοψη με το νέο σκάφος", (await page.locator("[data-summary]").count()) === 1 && (await rowText("boat")).includes("Ιστιοπλοϊκό") && (await rowText("boat")).includes("Bavaria Cruiser 46"), await rowText("boat"));
  // Πάλι «Δεν ξέρω ακόμα»: γυρνά αμέσως στη σύνοψη.
  await row("boat").click(); await page.waitForTimeout(400);
  await page.locator("[data-boat-unknown]").click(); await page.waitForTimeout(500);
  check("«Δεν ξέρω ακόμα» από τη σύνοψη: κατευθείαν πίσω", (await page.locator("[data-summary]").count()) === 1 && (await rowText("boat")).includes("δεν έχει οριστεί"));

  // ---- Διαμονή της hostess: και οι δύο θέσεις, μετά επιστροφή ----
  await row("cabin-hostess").click(); await page.waitForTimeout(500);
  check("γραμμή διαμονής hostess: πρώτη θέση «1 από 2»", (await text(page)).includes("1 από 2"));
  await pick("Κουκέτα");
  check("δεύτερη θέση «2 από 2»", (await text(page)).includes("2 από 2"));
  await pick("Skipper cabin");
  check("επιστροφή στη σύνοψη με τη νέα διαμονή", (await page.locator("[data-summary]").count()) === 1 && (await rowText("cabin-hostess")).includes("Κουκέτα / Skipper cabin") && (await rowText("cabin-skipper")).includes("Κουκέτα"), await rowText("cabin-hostess"));

  // ---- Προσθήκη ρόλου: ζητά τη διαμονή του, μετά σύνοψη ----
  await row("roles").click(); await page.waitForTimeout(500);
  await page.locator('[data-role-card="deckhand"]').click();
  await cont().click(); await page.waitForTimeout(500);
  check("νέος ρόλος: ρωτά πού θα μένει", (await text(page)).includes("Πού θα μένει ο deckhand;"));
  await pick("Κουκέτα");
  // οι προηγούμενες διαμονές δεν ξαναρωτιούνται: η σειρά ρόλων είναι skipper, hostess×2, deckhand → ρωτιούνται όλες όσες λείπουν
  t = await text(page);
  check("επιστροφή στη σύνοψη με τον νέο ρόλο", (await page.locator("[data-summary]").count()) === 1 && (await row("cabin-deckhand").count()) === 1, t.slice(0, 200));

  // ---- Ημερήσια εκδρομή: φεύγουν οι γραμμές διαμονής ----
  await row("dates").click(); await page.waitForTimeout(500);
  await pickDay(page, daysFromToday(12)); await pickDay(page, daysFromToday(12));
  await cont().click(); await page.waitForTimeout(500);
  check("ημερήσια εκδρομή: καμία γραμμή διαμονής", (await page.locator("[data-summary]").count()) === 1 && (await page.locator('[data-summary-row^="cabin-"]').count()) === 0);
  await row("dates").click(); await page.waitForTimeout(500);
  await pickDay(page, daysFromToday(12)); await pickDay(page, daysFromToday(14));
  await cont().click(); await page.waitForTimeout(500);
  check("ξανά πολυήμερο: γραμμές διαμονής πάλι εκεί, με τις παλιές απαντήσεις", (await page.locator("[data-summary]").count()) === 1 && (await rowText("cabin-hostess")).includes("Κουκέτα / Skipper cabin"));

  // ---- Γλώσσα ----
  await page.locator("[data-language-link]").click();
  const input = page.getByPlaceholder("Γράψε γλώσσα");
  await input.fill("Αγγ");
  check("τα Αγγλικά δεν προτείνονται (είναι δεδομένα)", (await page.locator("[data-language-option=en]").count()) === 0);
  await input.fill("Γερ");
  check("«Γερ» → Γερμανικά", (await page.locator("[data-language-option=de]").count()) === 1);
  await page.locator("[data-language-option=de]").click();
  await input.fill("Thai"); await page.locator("[data-language-option=th]").click();
  check("όσες θέλει: δύο chips, χωρίς Αγγλικά", (await page.locator("[data-language]").count()) === 2 && (await page.locator("[data-language=en]").count()) === 0);
  await shoot(page, "summary-lang");
  await cont().click();
  await page.waitForURL(/\/platform\/search\?/);
  const url = new URL(page.url());
  check("σύνδεσμος: lang=en,de,th, διαμονή ανά θέση, pos", url.searchParams.get("lang") === "en,de,th" && url.searchParams.get("pos") === "hostess:2" && url.searchParams.get("cabin").startsWith("skipper:bunk,hostess:bunk,hostess:skipper"), url.search);
});

// Αγγλικά: ίδια σύνοψη.
await as("6900002002", async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const cont = () => page.locator(".sf-step-footer button").first();
  await go(page, "/platform");
  await page.locator("button.sf-cta").click();
  await page.getByRole("button", { name: "Ελλάδα", exact: true }).click();
  await page.waitForTimeout(1500);
  await cont().click(); await page.waitForTimeout(600);
  await pickDay(page, daysFromToday(12)); await pickDay(page, daysFromToday(14)); await cont().click(); await page.waitForTimeout(600);
  await cont().click(); await page.waitForTimeout(600);
  await page.locator("[data-boat-unknown]").click(); await page.waitForTimeout(600);
  await page.locator('[data-role-card="cook"]').click();
  await cont().click(); await page.waitForTimeout(500);
  await page.context().addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
  await page.reload(); await page.waitForTimeout(2500);
  await page.locator("[data-cabin-choice]").getByRole("button", { name: "Bunk", exact: true }).click(); await page.waitForTimeout(500);
  const t = (await text(page));
  check("en: «Summary», 2 passengers, boat not set, Cook: Bunk, «+ Another language?»",
    t.includes("Summary") && t.includes("2 passengers") && t.includes("Boat: not set") && t.includes("Cook: Bunk") && t.includes("+ Another language?"), t.slice(0, 400));
  await shoot(page, "summary-en");
});
sql(`update users set locale = ${locale0 ? `'${locale0}'` : "null"} where id = '${MARIA}'`);
finish();
