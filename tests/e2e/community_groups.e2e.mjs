// Community, βήμα 3: ομάδες περιοχών. Λίστα με εικονίδιο και αριθμό μελών, συμμετοχή/αποχώρηση με ένα πάτημα (σε πολλές
// ομάδες), ροή συζήτησης με μηνύματα και απαντήσεις (αποστολέας, χρόνος), «Αναφορά» σε κάθε μήνυμα, ο κανονισμός και η
// ενημέρωση ότι η διαχείριση έχει πρόσβαση. Ελληνικά και αγγλικά, κινητό και υπολογιστής.
import { as, go, text, check, finish, shoot, sql, BASE } from "./lib.mjs";

const NIKOS = "a0000000-0000-0000-0000-000000000003"; // 6900002003
const GIORGOS = "a0000000-0000-0000-0000-000000000004"; // 6900002004

const resetLocales = () => sql("select set_config('platform.trusted', 'true', false); update users set locale = 'el' where locale <> 'el';");
const clean = () =>
  sql(`delete from community_reports where reporter_id in ('${NIKOS}','${GIORGOS}');
       delete from community_messages where author_id in ('${NIKOS}','${GIORGOS}');
       delete from community_group_members where user_id in ('${NIKOS}','${GIORGOS}');`);
const groupId = (slug) => sql(`select id from community_groups where slug = '${slug}'`);

function seed() {
  clean();
  const g = groupId("saronic");
  sql(`insert into community_group_members (group_id, user_id) values ('${g}', '${GIORGOS}')`);
  const id = sql(`insert into community_messages (group_id, author_id, body, created_at) values ('${g}', '${GIORGOS}', 'e2e Μελτέμι 6 μποφόρ στον Σαρωνικό αύριο', now() - interval '3 hours') returning id`).split("\n")[0];
  return { g, id };
}

async function run(phone, locale, w, h, tag) {
  const L = locale === "el"
    ? { rules: "αγγελίες εργασίας", admin: "Η διαχείριση έχει πρόσβαση στις συζητήσεις.", join: "Συμμετοχή", leave: "Αποχώρηση", members: "μέλος", joinWrite: "Συμμετοχή για να γράψεις", noMsg: "Κανένα μήνυμα ακόμα", back: "Ομάδες" }
    : { rules: "job ads", admin: "The administration can access the discussions.", join: "Join", leave: "Leave", members: "member", joinWrite: "Join to write", noMsg: "No messages yet", back: "Groups" };
  const { g, id: seeded } = seed();
  await as(phone, async (page) => {
    await page.setViewportSize({ width: w, height: h });
    if (locale === "en") await page.context().addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
    await go(page, "/platform/community");
    await page.locator('[data-community-tab="groups"]').click();
    await page.waitForSelector("[data-community-groups]");
    const label = `${locale} ${tag}`;
    const t0 = await text(page);

    // 1. Λίστα, κανονισμός, ενημέρωση για τη διαχείριση
    check(`${label}: τέσσερις ομάδες με εικονίδιο και αριθμό μελών`, (await page.locator("[data-group-open]").count()) === 4 && (await page.locator("[data-group-open] svg").count()) >= 4 && (await page.locator("[data-group-members]").first().innerText()).includes(L.members));
    check(`${label}: ο κανονισμός φαίνεται (σκοπός, όχι αγγελίες) και η διαχείριση έχει πρόσβαση`, (await page.locator("[data-community-rules]").count()) === 1 && t0.includes(L.rules) && t0.includes(L.admin), t0.slice(0, 400));
    if (locale === "el" && tag === "m") await shoot(page, "community-groups");

    // Συμμετοχή / αποχώρηση με ένα πάτημα, σε πολλές ομάδες
    const sar = page.locator('[data-group-toggle="saronic"]');
    const aeg = page.locator('[data-group-toggle="aegean"]');
    check(`${label}: κουμπί «${L.join}» σε ομάδα που δεν είμαι μέλος`, (await sar.innerText()) === L.join);
    await sar.click();
    await page.waitForFunction(() => document.querySelector('[data-group-toggle="saronic"]')?.getAttribute("aria-pressed") === "true");
    await aeg.click();
    await page.waitForFunction(() => document.querySelector('[data-group-toggle="aegean"]')?.getAttribute("aria-pressed") === "true");
    check(`${label}: μέλος σε δύο ομάδες ταυτόχρονα`, sql(`select count(*) from community_group_members where user_id = '${NIKOS}'`) === "2");
    check(`${label}: το κουμπί γίνεται «${L.leave}» και ο αριθμός μελών ενημερώνεται`, (await sar.innerText()) === L.leave && (await page.locator('[data-group-open="saronic"] [data-group-members]').innerText()).startsWith("2"));
    await aeg.click();
    await page.waitForFunction(() => document.querySelector('[data-group-toggle="aegean"]')?.getAttribute("aria-pressed") === "false");
    check(`${label}: αποχώρηση με ένα πάτημα`, sql(`select count(*) from community_group_members where user_id = '${NIKOS}'`) === "1");

    // 2. Ροή συζήτησης
    await page.locator('[data-group-open="saronic"]').click();
    await page.waitForSelector("[data-community-group]");
    check(`${label}: ομάδα με τίτλο, σύντομο κανονισμό, πλαίσιο γραφής`, (await page.locator("[data-group-title]").count()) === 1 && (await page.locator("[data-community-rules]").count()) === 1 && (await page.locator("[data-compose]").count()) === 1);
    check(`${label}: μήνυμα με αποστολέα και χρόνο`, (await page.locator(`[data-msg="${seeded}"] [data-msg-author]`).innerText()).includes("Γιώργος") && /\S/.test(await page.locator(`[data-msg="${seeded}"] [data-msg-time]`).innerText()));
    await page.locator("[data-compose]").fill("e2e Ευχαριστώ, το είδα");
    await page.locator("[data-compose-send]").click();
    await page.waitForFunction(() => document.querySelectorAll("[data-msg]").length >= 2);
    check(`${label}: νέο μήνυμα με το όνομά μου`, sql(`select count(*) from community_messages where author_id = '${NIKOS}' and body = 'e2e Ευχαριστώ, το είδα' and parent_id is null`) === "1" && (await text(page)).includes("Νίκος"));
    await page.locator(`[data-msg="${seeded}"] [data-msg-reply-btn]`).click();
    await page.locator("[data-reply-input]").fill("e2e Ναι, θα μείνουμε στο λιμάνι");
    await page.locator("[data-reply-send]").click();
    await page.waitForSelector('[data-msg-reply="true"]');
    check(`${label}: απάντηση κάτω από το μήνυμα`, sql(`select count(*) from community_messages where author_id = '${NIKOS}' and parent_id = '${seeded}'`) === "1" && (await page.locator(`[data-msg-reply="true"] [data-msg-author]`).innerText()).includes("Νίκος"));
    if (locale === "el" && tag === "m") await shoot(page, "community-thread");

    // 3. Αναφορά σε μήνυμα
    check(`${label}: «Αναφορά» σε ξένο μήνυμα, όχι στο δικό μου`, (await page.locator(`[data-msg="${seeded}"] [data-msg-report]`).count()) === 1 && (await page.locator(`[data-msg-reply="false"][data-msg]:not([data-msg="${seeded}"]) [data-msg-report]`).count()) === 0);
    await page.locator(`[data-msg="${seeded}"] [data-msg-report]`).click();
    await page.locator('[data-report-reason="offer"]').click();
    await page.locator("[data-report-send]").click();
    await page.waitForTimeout(900);
    check(`${label}: η αναφορά μηνύματος καταγράφεται`, sql(`select count(*) from community_reports where message_id = '${seeded}' and reason = 'offer' and status = 'open' and reporter_id = '${NIKOS}'`) === "1");

    // Διαγραφή δικού μου μηνύματος
    const mine = sql(`select id from community_messages where author_id = '${NIKOS}' and parent_id is null`).split("\n")[0];
    await page.locator(`[data-msg="${mine}"] [data-msg-delete]`).click();
    await page.getByRole("button", { name: locale === "el" ? "Διαγραφή" : "Delete", exact: true }).last().click();
    await page.waitForTimeout(1000);
    check(`${label}: ο συντάκτης διαγράφει το δικό του μήνυμα`, sql(`select deleted_at is not null from community_messages where id = '${mine}'`) === "t" && (await page.locator(`[data-msg="${mine}"]`).count()) === 0);

    // Ομάδα που δεν είμαι μέλος: διαβάζω, για να γράψω μπαίνω με ένα πάτημα
    await page.locator("[data-group-back]").click();
    await page.waitForSelector("[data-community-groups]");
    await page.locator('[data-group-open="aegean"]').click();
    await page.waitForSelector("[data-community-group]");
    check(`${label}: μη μέλος → διαβάζει, και ζητά «${L.joinWrite}»`, (await page.locator("[data-compose]").count()) === 0 && (await page.locator("[data-join-to-write]").innerText()) === L.joinWrite && (await text(page)).includes(L.noMsg));
    await page.locator("[data-join-to-write]").click();
    await page.waitForSelector("[data-compose]");
    check(`${label}: μετά τη συμμετοχή εμφανίζεται το πλαίσιο γραφής`, sql(`select count(*) from community_group_members where user_id = '${NIKOS}' and group_id = '${groupId("aegean")}'`) === "1");
    if (locale === "en" && tag === "d") await shoot(page, "community-groups-en");
  });
}

async function admin() {
  const { id } = seed();
  await as("6900002001", async (page) => {
    await go(page, "/platform/community");
    await page.locator('[data-community-tab="groups"]').click();
    await page.waitForSelector("[data-community-groups]");
    check("διαχειριστής: βλέπει τις ομάδες, χωρίς κουμπιά συμμετοχής", (await page.locator("[data-group-open]").count()) === 4 && (await page.locator("[data-group-toggle]").count()) === 0);
    await page.locator('[data-group-open="saronic"]').click();
    await page.waitForSelector(`[data-msg="${id}"]`);
    check("διαχειριστής: διαβάζει τη συζήτηση και μπορεί να διαγράψει ξένο μήνυμα, όχι να γράψει", (await page.locator(`[data-msg="${id}"] [data-msg-delete]`).count()) === 1 && (await page.locator("[data-compose]").count()) === 0);
    await page.locator(`[data-msg="${id}"] [data-msg-delete]`).click();
    await page.getByRole("button", { name: "Διαγραφή", exact: true }).last().click();
    await page.waitForTimeout(1000);
    check("διαχειριστής: διαγραφή μηνύματος μέλους, καταγράφεται", sql(`select deleted_at is not null from community_messages where id = '${id}'`) === "t" && sql("select count(*) from admin_actions where action_type = 'community_delete_message'") !== "0");
  });
}

resetLocales();
await run("6900002003", "el", 390, 844, "m");
await run("6900002003", "en", 1280, 900, "d");
await admin();
clean();
resetLocales();
finish();
