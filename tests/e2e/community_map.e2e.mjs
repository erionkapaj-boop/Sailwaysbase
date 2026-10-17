// Community, βήμα 2: ο κοινός χάρτης. Σημεία με εικονίδιο ανά κατηγορία, φίλτρα, κάρτα σημείου («Ισχύει ακόμη»,
// «Αναφορά προβλήματος», διόρθωση/διαγραφή από τον συντάκτη), προσθήκη χωρίς έλεγχο θέσης του μέλους, ηλικία αναφοράς.
// Ελληνικά και αγγλικά, κινητό και υπολογιστής.
import { as, go, text, check, finish, shoot, sql, BASE } from "./lib.mjs";

const NIKOS = "a0000000-0000-0000-0000-000000000003"; // 6900002003
const GIORGOS = "a0000000-0000-0000-0000-000000000004"; // 6900002004

const resetLocales = () => sql("select set_config('platform.trusted', 'true', false); update users set locale = 'el' where locale <> 'el';");
const clean = () => sql("delete from community_reports where reporter_id in ('" + NIKOS + "','" + GIORGOS + "'); delete from community_points where title like 'e2e %' or author_id in ('" + NIKOS + "','" + GIORGOS + "');");
clean();
resetLocales();

const insert = (cat, title, desc, lat, lng, author, observedAgo, confirmedAgo) =>
  sql(`insert into community_points (category, title, description, lat, lng, author_id, observed_at, last_confirmed_at, last_confirmed_by, expires_at)
       select '${cat}', '${title}', '${desc}', ${lat}, ${lng}, '${author}', now() - interval '${observedAgo}', now() - interval '${confirmedAgo}', '${author}',
              now() - interval '${confirmedAgo}' + make_interval(days => show_days)
         from community_category_settings where category = '${cat}' returning id`).split("\n")[0];

function seed() {
  clean();
  return {
    idHazard: insert("hazard", "e2e Ύφαλος στο ακρωτήρι", "Φαίνεται στα 2 μέτρα", 37.2, 24.4, GIORGOS, "2 days", "3 hours"),
    idWeather: insert("weather", "e2e Μελτέμι στον Κάβο", "Δυνατός βοριάς", 37.6, 25.1, GIORGOS, "40 hours", "40 hours"), // 2 ημέρες ισχύος: σχεδόν παλιό
    idAnchor: insert("anchorage", "e2e Όρμος με καλό αγκυροβόλιο", "Προστατευμένος από βόρειους", 36.9, 24.9, NIKOS, "5 days", "5 days"),
  };
}

const waitMarkers = (page, n) => page.waitForFunction((k) => document.querySelectorAll("[data-map-pin]").length >= k, n, { timeout: 15000 });
const pin = (page, id) => page.locator(`[data-map-pin="${id}"]`);

async function run(phone, locale, w, h, tag) {
  const { idHazard, idWeather, idAnchor } = seed();
  const L = locale === "el"
    ? { hazard: "Κίνδυνος", add: "Προσθήκη", valid: "Ισχύει ακόμη", report: "Αναφορά προβλήματος", member: "Αναφορά μέλους", observed: "Παρατηρήθηκε", confirmed: "Επιβεβαιώθηκε", old: "Παλιά αναφορά" }
    : { hazard: "Hazard", add: "Add", valid: "Still valid", report: "Report a problem", member: "Member report", observed: "Observed", confirmed: "Confirmed", old: "Old report" };
  await as(phone, async (page) => {
    await page.setViewportSize({ width: w, height: h });
    // Δεν ζητείται ποτέ η τοποθεσία του μέλους.
    await page.addInitScript(() => {
      window.__geoCalls = 0;
      const g = { getCurrentPosition() { window.__geoCalls++; }, watchPosition() { window.__geoCalls++; return 0; }, clearWatch() {} };
      try { Object.defineProperty(navigator, "geolocation", { value: g, configurable: true }); } catch {}
    });
    if (locale === "en") await page.context().addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
    await go(page, "/platform/community");
    await waitMarkers(page, 3);
    const label = `${locale} ${tag}`;
    await shoot(page, `community-map-${locale}`);

    // 1. Σημεία με εικονίδιο ανά κατηγορία + φίλτρα
    const cats = await page.locator("[data-map-pin]").evaluateAll((els) => els.map((e) => e.dataset.mapCategory).sort());
    check(`${label}: τρία σημεία, κάθε ένα με τη δική του κατηγορία`, cats.join() === "anchorage,hazard,weather", cats.join());
    check(`${label}: τα σημάδια έχουν εικονίδιο`, (await page.locator("[data-map-pin] svg").count()) >= 3);
    check(`${label}: πέντε φίλτρα κατηγορίας και «Όλα»`, (await page.locator("[data-filter]").count()) === 6);
    await page.locator('[data-filter="hazard"]').click();
    await page.waitForTimeout(300);
    check(`${label}: φίλτρο «${L.hazard}» δείχνει μόνο τα σημεία της κατηγορίας`, (await page.locator("[data-map-pin]").count()) === 1 && (await page.locator('[data-filter="hazard"]').getAttribute("aria-pressed")) === "true");
    await page.locator('[data-filter="all"]').click();
    await waitMarkers(page, 3);
    check(`${label}: «Όλα» τα επαναφέρει`, (await page.locator("[data-map-pin]").count()) === 3);

    // 5. Ηλικία: το σχεδόν παλιό φαίνεται διαφορετικά από το φρέσκο
    const ages = await page.locator("[data-map-pin]").evaluateAll((els) => Object.fromEntries(els.map((e) => [e.dataset.mapCategory, e.dataset.age])));
    check(`${label}: ηλικία στα σημάδια (φρέσκο, παλιό)`, ages.hazard === "fresh" && ages.weather === "old", JSON.stringify(ages));

    // 4. Κάρτα σημείου άλλου μέλους
    if (phone === "6900002003") {
      await pin(page, idHazard).click();
      await page.waitForSelector("[data-point-title]");
      const t1 = await text(page);
      check(`${label}: κάρτα με τίτλο, περιγραφή, κατηγορία, συντάκτη, ημερομηνίες`, t1.includes("e2e Ύφαλος") && t1.includes("Φαίνεται στα 2 μέτρα") && t1.includes(L.observed) && t1.includes(L.confirmed) && (await page.locator("[data-point-author]").innerText()).includes("Γιώργος") && (await page.locator("[data-point-category]").innerText()) === L.hazard, t1.slice(0, 300));
      check(`${label}: παρουσιάζεται ως αναφορά μέλους, όχι ως επίσημη`, t1.includes(L.member) && !/επίσημ(η|ο)ς?\s+επαληθ|verified/i.test(t1.replace(L.member, "")));
      check(`${label}: «${L.valid}» και «${L.report}», χωρίς διόρθωση/διαγραφή σε ξένο σημείο`, (await page.locator("[data-point-confirm]").count()) === 1 && (await page.locator("[data-point-report]").count()) === 1 && (await page.locator("[data-point-edit], [data-point-delete]").count()) === 0);
      if (tag === "m" && locale === "el") await shoot(page, "community-card");
      const before = sql(`select last_confirmed_at from community_points where id = '${idHazard}'`);
      await page.locator("[data-point-confirm]").click();
      await page.waitForTimeout(900);
      const after = sql(`select last_confirmed_at from community_points where id = '${idHazard}'`);
      check(`${label}: «${L.valid}» ανανεώνει την τελευταία επιβεβαίωση (όχι την παρατήρηση)`, after > before && sql(`select observed_at < now() - interval '1 day' from community_points where id = '${idHazard}'`) === "t");
      await page.locator("[data-point-report]").click();
      await page.locator('[data-report-reason="outdated"]').click();
      await page.locator("[data-report-send]").click();
      await page.waitForTimeout(900);
      check(`${label}: αναφορά προβλήματος καταγράφεται`, sql(`select count(*) from community_reports where point_id = '${idHazard}' and reason = 'outdated' and status = 'open'`) === "1");

      // Παλιά αναφορά: φαίνεται καθαρά
      await pin(page, idWeather).click();
      await page.waitForSelector("[data-point-age-note]");
      check(`${label}: παλιά αναφορά με ρητή ένδειξη`, (await text(page)).includes(L.old) || (await page.locator('[data-point-age-note="old"]').count()) === 1);
      await page.keyboard.press("Escape");

      // Δικό μου σημείο: διόρθωση
      await pin(page, idAnchor).click();
      await page.waitForSelector("[data-point-edit]");
      check(`${label}: ο συντάκτης βλέπει διόρθωση και διαγραφή, όχι αναφορά`, (await page.locator("[data-point-delete]").count()) === 1 && (await page.locator("[data-point-report]").count()) === 0);
      await page.locator("[data-point-edit]").click();
      await page.waitForSelector("[data-place-next]");
      check(`${label}: η διόρθωση ξεκινά με τη θέση που υπάρχει`, await page.locator("[data-place-next]").isEnabled());
      await page.locator("[data-place-next]").click();
      await page.locator("[data-form-title]").fill("e2e Όρμος, διορθωμένος");
      await page.locator("[data-form-next]").click();
      await page.waitForSelector("[data-form-save]");
      await page.locator("[data-form-save]").click();
      await page.waitForTimeout(1200);
      const row = sql(`select title, (observed_at < now() - interval '4 days') , (last_confirmed_at < now() - interval '4 days') from community_points where id = '${idAnchor}'`);
      check(`${label}: διόρθωση: νέος τίτλος, οι ημερομηνίες μένουν`, row === "e2e Όρμος, διορθωμένος|t|t", row);
    }

    // 2/3. Προσθήκη: θέση από τον χάρτη, κατηγορία, τίτλος, έλεγχος θέσης πριν την αποθήκευση
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.locator("[data-community-add]").click();
    await page.waitForSelector("[data-place-bar]");
    check(`${label}: προσθήκη → ζητά θέση στον χάρτη, «Συνέχεια» κλειστό`, !(await page.locator("[data-place-next]").isEnabled()));
    await page.locator("[data-map-frame]").click({ position: { x: Math.round(w > 600 ? 500 : 190), y: 180 } });
    await page.waitForTimeout(500);
    check(`${label}: μετά το πάτημα η θέση επιλέγεται και ανοίγει το «Συνέχεια»`, await page.locator("[data-place-next]").isEnabled());
    await page.locator("[data-place-next]").click();
    await page.waitForSelector("[data-form-title]");
    check(`${label}: η φόρμα θέλει κατηγορία και τίτλο`, !(await page.locator("[data-form-next]").isEnabled()));
    await page.locator('[data-form-category="useful_place"]').click();
    await page.locator("[data-form-title]").fill("e2e Καύσιμα στο λιμάνι");
    await page.locator("[data-form-description]").fill("Ανοιχτά μέχρι τις 20:00");
    if (tag === "m" && locale === "el") await shoot(page, "community-form");
    await page.locator("[data-form-next]").click();
    await page.waitForSelector("[data-review-map]");
    const coords = await page.locator("[data-review-coords]").innerText();
    check(`${label}: πριν την αποθήκευση φαίνεται ο χάρτης και οι συντεταγμένες της θέσης`, /^\d+\.\d{4}, \d+\.\d{4}$/.test(coords.trim()) && (await page.locator("[data-review-map] canvas").count()) > 0, coords);
    if (tag === "m" && locale === "el") await shoot(page, "community-review");
    // Επιστροφή και αλλαγή θέσης: τα στοιχεία μένουν
    await page.locator("[data-form-change-pos]").click();
    await page.waitForSelector("[data-place-next]");
    await page.locator("[data-place-next]").click();
    await page.waitForSelector("[data-form-title]");
    check(`${label}: μετά την αλλαγή θέσης τα στοιχεία έμειναν`, (await page.locator("[data-form-title]").inputValue()) === "e2e Καύσιμα στο λιμάνι");
    await page.locator("[data-form-next]").click();
    await page.locator("[data-form-save]").click();
    await page.waitForSelector("[data-point-title]", { timeout: 10000 });
    const added = sql(`select category || '|' || author_id || '|' || (abs(extract(epoch from (observed_at - now()))) < 120) || '|' || (photo_path is null) from community_points where title = 'e2e Καύσιμα στο λιμάνι' and status = 'active'`);
    check(`${label}: το σημείο αποθηκεύτηκε με συντάκτη και ημερομηνία παρατήρησης`, added.startsWith("useful_place|") && added.includes("|true|true"), added);
    check(`${label}: μετά την αποθήκευση ανοίγει η κάρτα του`, (await page.locator("[data-point-title]").innerText()).includes("Καύσιμα"));
    check(`${label}: δεν ζητήθηκε ποτέ η τοποθεσία του μέλους`, (await page.evaluate(() => window.__geoCalls)) === 0);
    if (tag === "d" && locale === "en") await shoot(page, "community-en");
    // Διαγραφή από τον συντάκτη
    if (phone === "6900002003" && locale === "el" && tag === "m") {
      await page.locator("[data-point-delete]").click();
      await page.getByRole("button", { name: "Διαγραφή", exact: true }).last().click();
      await page.waitForTimeout(1000);
      check(`${label}: ο συντάκτης διαγράφει τη δική του καταχώριση`, sql(`select count(*) from community_points where title = 'e2e Καύσιμα στο λιμάνι' and status = 'removed'`) === "1");
    }
  });
}

await run("6900002003", "el", 390, 844, "m");
await run("6900002003", "en", 1280, 900, "d");
resetLocales();
clean();
finish();
