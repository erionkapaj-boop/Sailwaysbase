// Οθόνη «Ποια βοήθεια θα ήθελες στο ταξίδι σου;»: κάρτες με εικονίδιο και όνομα, πολλαπλή επιλογή με τικ,
// μικρό «i» σε κάθε κάρτα που ανοίγει bottom sheet με το κείμενο ΧΩΡΙΣ να αλλάζει η επιλογή, και το
// «Συνέχεια» μόνο μετά την πρώτη επιλογή. Ελληνικά και αγγλικά.
import { BASE, as, go, text, check, finish, sql, pickDay, daysFromToday, shoot } from "./lib.mjs";

// Η εναλλαγή γλώσσας αποθηκεύεται στο προφίλ: η αρχική γλώσσα της πελάτισσας επανέρχεται στο τέλος.
const MARIA_ID = "a0000000-0000-0000-0000-000000000002";
const locale0 = sql(`select coalesce(locale, '') from users where id = '${MARIA_ID}'`);

const TEXTS = {
  el: {
    skipper: "Οδηγεί το σκάφος και φροντίζει την ασφάλειά σας. Ξέρει τα νερά, τον καιρό και τα ωραιότερα σημεία.",
    hostess: "Ετοιμάζει πρωινό και ελαφρύ μεσημεριανό, κρατάει το σκάφος τακτοποιημένο και βοηθάει τον skipper στα λιμάνια και στην άγκυρα. Εσείς απλώς απολαμβάνετε.",
    cook: "Μαγειρεύει όλα τα γεύματα πάνω στο σκάφος.",
    deckhand: "Ένα χέρι παραπάνω στο κατάστρωμα, για σχοινιά, δεσίματα και πλησιάσματα. Συνήθως σε μεγαλύτερα σκάφη, μαζί με hostess ή μάγειρα.",
  },
  en: {
    skipper: "Sails the boat and looks after your safety. Knows the waters, the weather and the best spots.",
    hostess: "Prepares breakfast and a light lunch, keeps the boat tidy and helps the skipper in ports and at anchor. You simply enjoy the trip.",
    cook: "Cooks all the meals on board.",
    deckhand: "An extra pair of hands on deck for lines, mooring and docking. Usually on larger boats, together with a hostess or a cook.",
  },
};
const NAMES = { el: ["Skipper", "Hostess", "Μάγειρας", "Deckhand"], en: ["Skipper", "Hostess", "Cook", "Deckhand"] };

await as("6900002002", async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, "/platform");
  await page.locator("[data-home-search]").click();
  await page.getByRole("button", { name: "Ελλάδα", exact: true }).click();
  await page.waitForTimeout(1500);
  const cont = () => page.locator(".sf-step-footer button").first();
  await cont().click(); await page.waitForTimeout(600);
  await pickDay(page, daysFromToday(12)); await pickDay(page, daysFromToday(14)); await cont().click(); await page.waitForTimeout(600);
  await cont().click(); await page.waitForTimeout(600);
  await page.locator("[data-boat-unknown]").click();
  await page.waitForTimeout(600);

  for (const locale of ["el", "en"]) {
    if (locale === "en") {
      await page.context().addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
      await page.reload();
      await page.waitForTimeout(2500);
    }
    const keys = ["skipper", "hostess", "cook", "deckhand"];
    let t = await text(page);
    check(`${locale}: τέσσερις κάρτες με εικονίδιο και όνομα`,
      (await page.locator("[data-role-card]").count()) === 4 && (await page.locator("[data-role-card] svg").count()) === 4 && NAMES[locale].every((n) => t.includes(n)), t.slice(0, 300));
    check(`${locale}: κείμενο εξήγησης δεν φαίνεται πάνω στις κάρτες, ούτε μπάρα αναζήτησης`,
      !t.includes(TEXTS[locale].skipper.slice(0, 20)) && (await page.locator("input[type=text], input[type=search]").count()) === 0);
    check(`${locale}: χωρίς «Συνέχεια» πριν από επιλογή`, (await cont().count()) === 0);
    await shoot(page, `roles-${locale}`);
    // πολλαπλή επιλογή με τικ
    await page.locator('[data-role-card="skipper"]').click();
    await page.locator('[data-role-card="hostess"]').click();
    check(`${locale}: πολλαπλή επιλογή (2 κάρτες με τικ) και εμφανίζεται «Συνέχεια»`,
      (await page.locator("[data-role-card][aria-pressed=true]").count()) === 2 && (await page.locator("[data-role-card][aria-pressed=true] svg").count()) === 4 && (await cont().count()) === 1);
    await page.locator('[data-role-card="hostess"]').click();
    check(`${locale}: δεύτερο πάτημα αφαιρεί την επιλογή`, (await page.locator("[data-role-card][aria-pressed=true]").count()) === 1);
    // «i»: sheet χωρίς αλλαγή επιλογής
    for (const k of keys) {
      const before = await page.locator("[data-role-card][aria-pressed=true]").count();
      await page.locator(`[data-role-info="${k}"]`).click();
      const sheet = page.locator(`[data-role-sheet="${k}"]`);
      check(`${locale}: «i» ${k}: ανοίγει το κείμενο, η επιλογή δεν αλλάζει`,
        (await sheet.count()) === 1 && (await sheet.innerText()).includes(TEXTS[locale][k]) && (await page.locator("[data-role-card][aria-pressed=true]").count()) === before, await sheet.innerText().catch(() => ""));
      if (k === "hostess") await shoot(page, `role-sheet-${locale}`);
      if (k === "skipper") await page.keyboard.press("Escape");
      else if (k === "hostess") await page.locator("[data-role-sheet-backdrop]").click({ position: { x: 5, y: 5 } });
      else await sheet.getByRole("button").last().click();
      await page.waitForTimeout(250);
      check(`${locale}: ${k}: το sheet κλείνει`, (await page.locator("[data-role-sheet]").count()) === 0);
    }
    check(`${locale}: μετά τα sheets η επιλογή (μόνο Skipper) μένει`, (await page.locator('[data-role-card="skipper"][aria-pressed=true]').count()) === 1 && (await page.locator("[data-role-card][aria-pressed=true]").count()) === 1);
    await page.locator('[data-role-card="skipper"]').click(); // καθαρή αρχή για την επόμενη γλώσσα
  }
});
sql(`update users set locale = ${locale0 ? `'${locale0}'` : "null"} where id = '${MARIA_ID}'`);
finish();
