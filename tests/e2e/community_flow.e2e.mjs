// Community, βήμα 4: η ροή από άκρη σε άκρη. Εγκεκριμένο μέλος ανοίγει Community, φιλτράρει σημεία, προσθέτει παρατήρηση,
// αναφέρει πρόβλημα, μπαίνει σε ομάδα και γράφει μήνυμα· η διαχείριση βλέπει τις αναφορές και παρεμβαίνει (απόρριψη,
// διαγραφή περιεχομένου, περιορισμός μέλους, κλείσιμο ομάδας, διάρκειες ανά κατηγορία)· ο περιορισμένος διαβάζει αλλά δεν γράφει.
// Δεν υπάρχει αυτόματη απόκρυψη μετά από αριθμό αναφορών.
import { as, go, text, check, finish, shoot, sql } from "./lib.mjs";

const NIKOS = "a0000000-0000-0000-0000-000000000003"; // 6900002003, επιλέξιμο μέλος
const GIORGOS = "a0000000-0000-0000-0000-000000000004"; // 6900002004, επιλέξιμο μέλος

const resetLocales = () => sql("select set_config('platform.trusted', 'true', false); update users set locale = 'el' where locale <> 'el';");
const clean = () =>
  sql(`delete from community_reports where reporter_id in ('${NIKOS}','${GIORGOS}');
       delete from community_restrictions where user_id in ('${NIKOS}','${GIORGOS}');
       delete from community_messages where author_id in ('${NIKOS}','${GIORGOS}');
       delete from community_group_members where user_id in ('${NIKOS}','${GIORGOS}');
       delete from community_points where author_id in ('${NIKOS}','${GIORGOS}');
       update community_groups set status = 'open', closed_at = null, closed_by = null, closed_reason = null;
       update community_category_settings set show_days = 60, archive_days = 365 where category = 'hazard';`);
const one = (q) => sql(q).split("\n")[0];

clean();
resetLocales();
const seeded = one(`insert into community_points (category, title, description, lat, lng, author_id, observed_at, last_confirmed_at, last_confirmed_by, expires_at)
  select 'hazard', 'e2e Ύφαλος στο ακρωτήρι', 'Φαίνεται στα 2 μέτρα', 37.2, 24.4, '${GIORGOS}', now() - interval '1 day', now() - interval '1 day', '${GIORGOS}', now() + make_interval(days => show_days - 1)
    from community_category_settings where category = 'hazard' returning id`);

// 1. Το μέλος: από το μενού εφαρμογών ως το μήνυμα
await as("6900002003", async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, "/platform");
  await page.getByRole("button", { name: "Περισσότερα", exact: true }).click();
  await page.locator('[data-app="community"]').click();
  await page.waitForURL(/\/platform\/community/, { timeout: 10000 });
  await page.waitForSelector("[data-community-map]");
  check("μέλος: το Community ανοίγει από το μενού εφαρμογών, στον Χάρτη", (await page.locator('[data-community-tab="map"]').getAttribute("aria-selected")) === "true");
  await page.waitForFunction(() => document.querySelectorAll("[data-map-pin]").length >= 1);
  await page.locator('[data-filter="weather"]').click();
  await page.waitForTimeout(300);
  check("μέλος: φίλτρο καιρού κρύβει τον κίνδυνο", (await page.locator("[data-map-pin]").count()) === 0);
  await page.locator('[data-filter="hazard"]').click();
  await page.locator('[data-filter="weather"]').click();
  await page.waitForFunction(() => document.querySelectorAll("[data-map-pin]").length === 1);
  check("μέλος: φίλτρο κινδύνου δείχνει το σημείο", (await page.locator(`[data-map-pin="${seeded}"]`).count()) === 1);
  await page.locator('[data-filter="all"]').click();

  await page.locator("[data-community-add]").click();
  await page.locator("[data-map-frame]").click({ position: { x: 200, y: 200 } });
  await page.locator("[data-place-next]").click();
  await page.locator('[data-form-category="weather"]').click();
  await page.locator("[data-form-title]").fill("e2e Μελτέμι 7 μποφόρ στον Κάβο");
  await page.locator("[data-form-description]").fill("Ριπές μέχρι 35 κόμβους");
  await page.locator("[data-form-next]").click();
  await page.locator("[data-form-save]").click();
  await page.waitForSelector("[data-point-title]", { timeout: 10000 });
  check("μέλος: η παρατήρηση προστέθηκε (καιρός) με τον συντάκτη", sql(`select count(*) from community_points where title = 'e2e Μελτέμι 7 μποφόρ στον Κάβο' and category = 'weather' and author_id = '${NIKOS}'`) === "1");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  await page.locator(`[data-map-pin="${seeded}"]`).click();
  await page.locator("[data-point-report]").click();
  await page.locator('[data-report-reason="wrong"]').click();
  await page.locator("[data-report-send]").click();
  await page.waitForTimeout(900);
  check("μέλος: αναφέρει πρόβλημα σε σημείο άλλου μέλους", sql(`select count(*) from community_reports where point_id = '${seeded}' and reporter_id = '${NIKOS}' and reason = 'wrong' and status = 'open'`) === "1");

  await page.locator('[data-community-tab="groups"]').click();
  await page.waitForSelector("[data-community-groups]");
  await page.locator('[data-group-toggle="aegean"]').click();
  await page.waitForFunction(() => document.querySelector('[data-group-toggle="aegean"]')?.getAttribute("aria-pressed") === "true");
  await page.locator('[data-group-open="aegean"]').click();
  await page.waitForSelector("[data-compose]");
  await page.locator("[data-compose]").fill("e2e Ψάχνω πλήρωμα για Σεπτέμβριο, στείλτε τηλέφωνο");
  await page.locator("[data-compose-send]").click();
  await page.waitForSelector("[data-msg]");
  check("μέλος: μπήκε στην ομάδα και έγραψε μήνυμα", sql(`select count(*) from community_group_members m join community_groups g on g.id = m.group_id where g.slug = 'aegean' and m.user_id = '${NIKOS}'`) === "1" && sql(`select count(*) from community_messages where author_id = '${NIKOS}' and body like 'e2e Ψάχνω πλήρωμα%'`) === "1");
});

// Άλλο μέλος αναφέρει το μήνυμα (αγγελία πληρώματος)
const msgId = one(`select id from community_messages where author_id = '${NIKOS}' and body like 'e2e Ψάχνω πλήρωμα%'`);
await as("6900002004", async (page) => {
  await go(page, "/platform/community");
  await page.locator('[data-community-tab="groups"]').click();
  await page.locator('[data-group-toggle="aegean"]').click();
  await page.waitForFunction(() => document.querySelector('[data-group-toggle="aegean"]')?.getAttribute("aria-pressed") === "true");
  await page.locator('[data-group-open="aegean"]').click();
  await page.waitForSelector(`[data-msg="${msgId}"]`);
  await page.locator(`[data-msg="${msgId}"] [data-msg-report]`).click();
  await page.locator('[data-report-reason="offer"]').click();
  await page.locator("[data-report-send]").click();
  await page.waitForTimeout(900);
  check("δεύτερο μέλος: αναφέρει το μήνυμα ως αγγελία πληρώματος", sql(`select count(*) from community_reports where message_id = '${msgId}' and reason = 'offer' and status = 'open'`) === "1");
});

// 2. Η διαχείριση ελέγχει και παρεμβαίνει
await as("6900002001", async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, "/platform/admin/community");
  await page.waitForSelector("[data-report]");
  check("διαχείριση: δύο ανοιχτές αναφορές, σημείου και μηνύματος, με περιεχόμενο", (await page.locator("[data-report]").count()) === 2 && (await text(page)).includes("Φαίνεται στα 2 μέτρα") && (await text(page)).includes("Ψάχνω πλήρωμα για Σεπτέμβριο"));
  const pointCard = page.locator('section:has([data-report-type="point"])');
  const msgCard = page.locator('section:has([data-report-type="message"])');
  check("διαχείριση: φαίνονται ο αναφέρων και ο συντάκτης", (await pointCard.innerText()).includes("Νίκος") && (await pointCard.innerText()).includes("Γιώργος") && (await msgCard.innerText()).includes("Γιώργος") && (await msgCard.innerText()).includes("Νίκος"));
  await shoot(page, "community-admin");

  // Απόρριψη της αναφοράς σημείου: το σημείο μένει
  await pointCard.locator('[data-act="dismiss"]').click();
  await page.waitForFunction(() => document.querySelectorAll("[data-report]").length === 1);
  check("διαχείριση: απόρριψη αναφοράς, το σημείο μένει ορατό", sql(`select status from community_reports where point_id = '${seeded}'`) === "dismissed" && sql(`select status from community_points where id = '${seeded}'`) === "active");

  // Μήνυμα: διαγραφή περιεχομένου, περιορισμός συντάκτη, κλείσιμο ομάδας
  await msgCard.locator('[data-act="remove"]').click();
  await page.getByRole("button", { name: "Διαγραφή περιεχομένου", exact: true }).last().click();
  await page.waitForTimeout(1000);
  check("διαχείριση: διαγραφή περιεχομένου, η αναφορά κλείνει", sql(`select deleted_at is not null from community_messages where id = '${msgId}'`) === "t");
  await page.locator('[data-admin-community-tab="reports"]').click();
  await page.locator("[data-report-filter]").selectOption("closed");
  await page.waitForSelector("[data-report]");
  check("διαχείριση: στις κλειστές το περιεχόμενο φαίνεται ακόμα, σημειωμένο ως διαγραμμένο", (await text(page)).includes("Ψάχνω πλήρωμα για Σεπτέμβριο") && (await text(page)).includes("Διαγράφηκε"));
  await page.locator("[data-report-filter]").selectOption("open");
  await page.waitForTimeout(500);

  // Περιορισμός και κλείσιμο από τις οθόνες των ομάδων/περιορισμών (η αναφορά του μηνύματος έκλεισε)
  sql(`insert into community_reports (target_type, message_id, reporter_id, reason, note) values ('message', '${msgId}', '${GIORGOS}', 'abuse', 'e2e δεύτερη')`);
  await go(page, "/platform/admin/community");
  await page.waitForSelector('[data-report-type="message"]');
  const again = page.locator('[data-report-type="message"]');
  await again.locator('[data-act="restrict"]').click();
  await again.locator('[data-restrict-days="7"]').click();
  await again.locator("[data-restrict-reason]").selectOption("offers");
  await again.locator("[data-restrict-apply]").click();
  await page.waitForTimeout(1000);
  check("διαχείριση: προσωρινός περιορισμός μέλους (7 ημέρες, αγγελίες)", sql(`select reason || (until > now() + interval '6 days' and until < now() + interval '8 days')::text from community_restrictions where user_id = '${NIKOS}'`) === "offerstrue");
  await page.locator('[data-report-type="message"] [data-act="group"]').click();
  await page.getByRole("button", { name: "Κλείσιμο ομάδας", exact: true }).last().click();
  await page.waitForTimeout(1000);
  check("διαχείριση: κλείσιμο ομάδας", sql("select status from community_groups where slug = 'aegean'") === "closed");
  await page.locator('[data-report-type="message"] [data-act="dismiss"]').click();
  await page.waitForTimeout(800);

  await page.locator('[data-admin-community-tab="restrictions"]').click();
  await page.waitForSelector("[data-restriction]");
  check("διαχείριση: ο περιορισμός φαίνεται στη λίστα", (await page.locator(`[data-restriction="${NIKOS}"]`).count()) === 1);
  await page.locator('[data-admin-community-tab="groups"]').click();
  check("διαχείριση: η ομάδα φαίνεται κλειστή", (await page.locator('[data-admin-group="aegean"]').innerText()).includes("Κλειστή"));

  // Διάρκειες ανά κατηγορία (ο ιδιοκτήτης)
  await page.locator('[data-admin-community-tab="settings"]').click();
  await page.waitForSelector("[data-community-settings]");
  const row = page.locator('[data-setting="hazard"]');
  await row.locator("[data-setting-show]").fill("45");
  await row.locator("[data-setting-save]").click();
  await page.waitForTimeout(900);
  check("διαχείριση: αλλαγή διάρκειας εμφάνισης ανά κατηγορία", sql("select show_days from community_category_settings where category = 'hazard'") === "45");
  check("διαχείριση: οι αλλαγές ισχύουν αμέσως στα ενεργά σημεία", sql(`select expires_at < now() + interval '45 days' from community_points where id = '${seeded}'`) === "t");
});

// 3. Ο περιορισμένος: διαβάζει, δεν γράφει· η ομάδα είναι κλειστή
await as("6900002003", async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, "/platform/community");
  await page.waitForSelector("[data-community-map]");
  await page.waitForFunction(() => document.querySelectorAll("[data-map-pin]").length >= 1);
  check("περιορισμένος: βλέπει τον χάρτη, χωρίς κουμπί «Προσθήκη»", (await page.locator("[data-community-add]").count()) === 0);
  await page.locator('[data-community-tab="groups"]').click();
  await page.waitForSelector("[data-community-groups]");
  await page.locator('[data-group-open="aegean"]').click();
  await page.waitForSelector("[data-community-group]");
  check("περιορισμένος: στην κλειστή ομάδα δεν γράφει, και δεν βλέπει το διαγραμμένο κείμενο", (await page.locator("[data-compose]").count()) === 0 && (await page.locator("[data-group-closed]").count()) === 1 && !(await text(page)).includes("Ψάχνω πλήρωμα"));
});

// Άρση περιορισμού από τη διαχείριση → ξανά κανονική συμμετοχή
await as("6900002001", async (page) => {
  await go(page, "/platform/admin/community");
  await page.locator('[data-admin-community-tab="restrictions"]').click();
  await page.waitForSelector("[data-lift]");
  await page.locator("[data-lift]").click();
  await page.waitForTimeout(900);
  check("διαχείριση: άρση περιορισμού", sql(`select count(*) from community_restrictions where user_id = '${NIKOS}' and until > now()`) === "0");
});
await as("6900002003", async (page) => {
  await go(page, "/platform/community");
  await page.waitForSelector("[data-community-map]");
  check("μέλος μετά την άρση: ξαναβλέπει «Προσθήκη»", (await page.locator("[data-community-add]").count()) === 1);
});

// Καμία αυτόματη απόκρυψη: πολλές αναφορές δεν κρύβουν το σημείο
sql(`insert into community_reports (target_type, point_id, reporter_id, reason) values ('point', '${seeded}', '${NIKOS}', 'abuse'), ('point', '${seeded}', '${GIORGOS}', 'wrong')`);
check("καμία αυτόματη απόκρυψη μετά από πολλές αναφορές", sql(`select status from community_points where id = '${seeded}'`) === "active" && sql(`select count(*) from community_list_points_probe`.replace("community_list_points_probe", "community_points where id = '" + seeded + "' and status = 'active' and expires_at > now()")) === "1");

clean();
resetLocales();
finish();
