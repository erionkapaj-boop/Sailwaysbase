// Χάρτης (docs/MAP_PLAN.md, Φάση Α): η οθόνη διαχείρισης «Χάρτης». Ο ιδιοκτήτης
// διαλέγει μέρος, μετακινεί την καρφίτσα, αποθηκεύει (στη βάση), πατά στον
// χάρτη και το σύστημα αναγνωρίζει το μέρος, και επαναφέρει την αυτόματη θέση.
// Τα τεστ τρέχουν με το απλό υπόβαθρο (χωρίς δίκτυο): ίδια διεπαφή.
import { BASE, as, go, text, check, finish, sql, num, shoot } from "./lib.mjs";

sql(`delete from place_positions`);

await as("6900002001", async (page) => {
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(`   [console ${m.type()}] ${m.text().slice(0, 500)}`); });
  page.on("pageerror", (e) => console.log(`   [pageerror] ${String(e.stack || e.message).slice(0, 700)}`));
  await go(page, "/platform/admin/map");
  await page.waitForSelector('[data-map-ready="true"]', { timeout: 30000 });
  let t = await text(page);
  const norm = (x) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); // τίτλοι σε κεφαλαία (CSS)
  check("η οθόνη φορτώνει, με περίληψη και φίλτρα", norm(t).includes("προς ελεγχο") && norm(t).includes("χωρις θεση"), t.slice(0, 300));
  check("απλό υπόβαθρο στα τεστ (χωρίς δίκτυο)", (await page.getAttribute("[data-map-ready]", "data-map-mode")) === "plain");
  await shoot(page, "map-admin");

  console.log("\n== 1. Επιλογή μέρους και μετακίνηση της καρφίτσας");
  await page.getByLabel("Αναζήτηση μέρους").fill("Λαύριο");
  await page.locator('[data-place-row="Λαύριο"]').click();
  await page.waitForSelector("[data-map-marker]", { timeout: 15000 });
  t = await text(page);
  check("επιλέχθηκε το Λαύριο, με καρφίτσα", norm(t).includes("επιλεγμενο: λαυριο"), t.slice(0, 400));
  check("το κουμπί αποθήκευσης είναι κλειστό πριν τη μετακίνηση", await page.getByRole("button", { name: "Αποθήκευση θέσης", exact: true }).isDisabled());

  const marker = page.locator("[data-map-marker]");
  const mb = await marker.boundingBox();
  await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2);
  await page.mouse.down();
  await page.mouse.move(mb.x + mb.width / 2 + 40, mb.y + mb.height / 2 + 15, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  check("μετά τη μετακίνηση, η αποθήκευση ανοίγει", !(await page.getByRole("button", { name: "Αποθήκευση θέσης", exact: true }).isDisabled()));
  await page.getByRole("button", { name: "Αποθήκευση θέσης", exact: true }).click();
  await page.waitForTimeout(1500);
  check("στη βάση, μία διόρθωση για το Λαύριο", num(`select count(*) from place_positions where place_key = 'Λαύριο'`) === 1);
  check("μήνυμα επιβεβαίωσης", (await text(page)).includes("Η θέση αποθηκεύτηκε."));
  check("το μέρος φαίνεται ως «Διορθωμένη»", (await page.locator('[data-place-row="Λαύριο"]').innerText()).includes("Διορθωμένη"));
  await shoot(page, "map-admin-selected");

  console.log("\n== 2. Πάτημα στον χάρτη: τι αναγνωρίζει το σύστημα");
  const saved = sql(`select lng || ',' || lat from place_positions where place_key = 'Λαύριο'`).split(",").map(Number);
  const px = await page.evaluate(([lng, lat]) => {
    const el = document.querySelector("[data-map-frame] [role=region]");
    el.__map.jumpTo({ center: [lng, lat], zoom: 12 }); // κοντά, ώστε λίγα pixel = λίγα μέτρα
    const p = el.__map.project([lng, lat]);
    const r = el.getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }, saved);
  // Λίγο κάτω από την καρφίτσα (να μην πατηθεί η ίδια η καρφίτσα).
  await page.mouse.click(px.x + 18, px.y + 34);
  await page.waitForTimeout(600);
  t = await text(page);
  check("πάτημα δίπλα στο Λαύριο → «Λαύριο», Σαρωνικός", /Εδώ:\s*Λαύριο \(\d/.test(t) && t.includes("Σαρωνικός"), (await page.locator("[data-map-here]").innerText()));
  await page.mouse.click(px.x + 18, px.y - 120);
  await page.waitForTimeout(600);
  check("πάτημα στη θάλασσα πιο μακριά → δείχνει πάντα κάτι (μέρος, περιοχή ή «δεν αναγνωρίζεται»)", /Εδώ:\s*\S/.test(await text(page)));

  console.log("\n== 3. Επαναφορά στην αυτόματη θέση");
  await page.getByRole("button", { name: "Επαναφορά στην αυτόματη", exact: true }).click();
  await page.waitForTimeout(1500);
  check("η διόρθωση σβήστηκε", num(`select count(*) from place_positions`) === 0);
  check("μήνυμα επαναφοράς", (await text(page)).includes("Επαναφέρθηκε η αυτόματη θέση."));

  console.log("\n== 4. Αγγλικά");
  await page.context().addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
  await go(page, "/platform/admin/map");
  await page.waitForSelector('[data-map-ready="true"]', { timeout: 30000 });
  const en = await page.evaluate(() => {
    document.querySelectorAll("[data-user-text]").forEach((n) => n.remove());
    return document.body.innerText;
  });
  check("αγγλικά: τίτλος και κείμενα, χωρίς ελληνικά γράμματα", en.includes("Map") && en.includes("To review") && !/[\u0370-\u03ff]/.test(en), en.slice(0, 400));
  check("αγγλικά: ονόματα στα χειριστήρια του χάρτη", (await page.locator('[aria-label="Zoom in"]').count()) === 1);
  await shoot(page, "map-admin-en");
});

await as("6900002002", async (page) => {
  await go(page, "/platform/admin/map");
  await page.waitForTimeout(1200);
  check("ο πελάτης δεν βλέπει τη διαχείριση", (await text(page)).includes("Πρόσβαση μόνο για διαχειριστές"));
});

sql(`delete from place_positions`);
check("καθαρισμός", num(`select count(*) from place_positions`) === 0);
finish();
