// «Οι ρόλοι μου» (βήμα 3): ανοίγει από το «Αλλαγή ρόλου», αλλαγή τρέχοντος ρόλου, σε έλεγχο, εγγραφή ρόλου που δεν έχει,
// εσωτερικοί ρόλοι μόνο σε Administrator. Κινητό και υπολογιστής, ελληνικά και αγγλικά.
import { as, go, check, finish, shoot, sql, BASE, eventually } from "./lib.mjs";

const CLIENT = "6900002002"; // Μαρία Πελάτη: μόνο Πελάτης
const SKIPPER = "6900002003"; // Νίκος Αρχικός: Πελάτης + Επαγγελματίας
const ADMIN = "6900002001";

const uid = (phone) => sql(`select id from users where phone_number = '+30${phone}'`);
const activeRole = (phone) => sql(`select active_role from users where phone_number = '+30${phone}'`);
const RING = { client: "rgb(111, 155, 200)", professional: "rgb(195, 161, 100)", admin: "rgb(210, 119, 108)" };
const reset = () => {
  sql("delete from user_roles where role in ('company', 'creator')");
  sql("update users set active_role = 'client', locale = 'el'");
};
reset();

const ring = (page) => page.evaluate(() => getComputedStyle(document.querySelector("[data-profile-menu] [data-role-ring]")).borderTopColor);
const openRoles = async (page) => {
  await page.locator("[data-profile-menu]").click();
  await page.locator("[data-profile-pop]").waitFor();
  await page.locator("[data-pm-change-role]").click();
  await page.waitForURL(/\/platform\/roles$/);
  await page.locator("[data-roles-list]").waitFor();
};
const rowsOf = (page) => page.evaluate(() => [...document.querySelectorAll("[data-role-row]")].map((r) => `${r.dataset.roleRow}:${r.dataset.roleStatus}${r.dataset.roleCurrent ? ":current" : ""}`));
const layout = (page) => page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  minH: Math.min(...[...document.querySelectorAll("[data-role-row]")].map((r) => r.getBoundingClientRect().height)),
}));

try {
  // 1. Επαγγελματίας: αλλαγή ρόλου, ρόλοι που δεν έχει, χωρίς εσωτερικούς.
  for (const [locale, vw] of [["el", 390], ["el", 1280], ["en", 1280]]) {
    await as(SKIPPER, async (page) => {
      await page.setViewportSize({ width: vw, height: vw === 390 ? 844 : 900 });
      if (locale === "en") await page.context().addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
      await go(page, "/platform/board");
      const tag = `${locale}/${vw}`;
      await openRoles(page);
      check(`${tag}: το μενού προφίλ έκλεισε και άνοιξε η οθόνη ρόλων`, (await page.locator("[data-profile-pop]").count()) === 0 && page.url().endsWith("/platform/roles"));
      const t = await page.innerText("body");
      const title = locale === "el" ? "Οι ρόλοι μου" : "My roles";
      check(`${tag}: τίτλος «${title}»`, t.includes(title));
      check(`${tag}: λίστα με τους δικούς του ρόλους, ο Πελάτης τρέχων`, (await rowsOf(page)).join() === "client:active:current,professional:active", (await rowsOf(page)).join());
      check(`${tag}: όχι Ομάδα / Administrator σε απλό χρήστη`, !t.includes("Skipper Finder team") && !t.includes("Ομάδα Skipper Finder") && !t.includes("Administrator"));
      const d = locale === "el" ? ["Αναζήτηση πληρώματος, σκαφών και εμπειριών", "Skipper, Hostess, Cook, Deckhand"] : ["Find crew, boats and experiences", "Skipper, Hostess, Cook, Deckhand"];
      check(`${tag}: περιγραφές`, d.every((x) => t.includes(x)), t.slice(0, 300));
      const lay = await layout(page);
      check(`${tag}: χωρίς οριζόντια κύλιση, γραμμές ≥ 44px`, lay.overflow === 0 && lay.minH >= 44, JSON.stringify(lay));
      check(`${tag}: κουμπί «${locale === "el" ? "Πρόσθεσε ρόλο" : "Add a role"}»`, (await page.locator("[data-add-role]").count()) === 1);
      if (locale === "el" && vw === 390) await shoot(page, "roles-el-390");
      await page.locator("[data-add-role]").click();
      await page.locator("[data-roles-available]").waitFor();
      check(`${tag}: μετά το κουμπί φαίνονται οι ρόλοι που δεν έχει`, (await rowsOf(page)).slice(-2).join() === "company:none,creator:none", (await rowsOf(page)).join());
      await page.waitForTimeout(300);
      await shoot(page, `roles-${locale}-${vw}-add`);
      // Αλλαγή τρέχοντος ρόλου.
      check(`${tag}: δαχτυλίδι Πελάτη`, (await ring(page)) === RING.client);
      await page.locator('[data-role-row="professional"]').click();
      await eventually(async () => activeRole(SKIPPER) === "professional");
      check(`${tag}: ο τρέχων ρόλος αποθηκεύτηκε στη βάση`, activeRole(SKIPPER) === "professional");
      await page.waitForURL((u) => !u.pathname.endsWith("/roles"), { timeout: 5000 });
      check(`${tag}: επιστρέφει εκεί από όπου ήρθε`, page.url().includes("/platform/board"));
      await eventually(async () => (await ring(page)) === RING.professional);
      check(`${tag}: το δαχτυλίδι του avatar έγινε άμμος`, (await ring(page)) === RING.professional);
      // Μετά από ανανέωση μένει.
      await page.reload();
      await page.waitForLoadState("networkidle");
      await eventually(async () => (await ring(page)) === RING.professional);
      check(`${tag}: μένει μετά την ανανέωση`, (await ring(page)) === RING.professional);
      await openRoles(page);
      check(`${tag}: ο Επαγγελματίας έχει τικ`, (await rowsOf(page)).join() === "client:active,professional:active:current", (await rowsOf(page)).join());
      sql(`update users set active_role = 'client', locale = 'el' where phone_number = '+30${SKIPPER}'`);
    });
  }

  // 2. Σε έλεγχο: ένδειξη, δεν επιλέγεται. Ρόλος που δεν έχει: εγγραφή / «Σύντομα».
  await as(CLIENT, async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    sql(`insert into user_roles (user_id, role, status) values ('${uid(CLIENT)}', 'company', 'pending')`);
    await go(page, "/platform/board");
    await openRoles(page);
    check("σε έλεγχο: ένδειξη «Σε έλεγχο»", (await page.locator("[data-role-pending]").innerText()) === "Σε έλεγχο");
    check("σε έλεγχο: στη λίστα, όχι στους διαθέσιμους", (await rowsOf(page)).join() === "client:active:current,company:pending");
    await page.locator('[data-role-row="company"]').click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    check("σε έλεγχο: δεν επιλέγεται", page.url().endsWith("/platform/roles") && activeRole(CLIENT) === "client");
    await shoot(page, "roles-pending-390");
    await page.locator("[data-add-role]").click();
    await page.locator('[data-role-row="creator"]').click();
    await page.waitForURL(/\/platform\/roles\/soon\?role=creator/);
    await page.waitForLoadState("networkidle");
    await page.getByRole("heading", { name: "Δημιουργός εμπειριών" }).waitFor();
    const soon = await page.innerText("body");
    check("Δημιουργός: οθόνη «Σύντομα» με το όνομα του ρόλου", soon.includes("Δημιουργός εμπειριών") && soon.includes("Σύντομα"), soon.slice(0, 200));
    sql("delete from user_roles where role in ('company', 'creator')");
    await go(page, "/platform/roles");
    await page.locator("[data-roles-list]").waitFor();
    await page.locator("[data-add-role]").click();
    await page.locator('[data-role-row="professional"]').click();
    await page.waitForURL(/\/platform\/profile\?become=professional/);
    await page.waitForLoadState("networkidle");
    await eventually(async () => (await page.locator("#bp-license-number").count()) === 1);
    check("Επαγγελματίας: ανοίγει η υπάρχουσα φόρμα εγγραφής επαγγελματία", (await page.locator("#bp-license-number").count()) === 1);
    await shoot(page, "roles-become-professional");
    check("δεν δημιουργήθηκε ρόλος χωρίς εγγραφή", sql(`select count(*) from user_roles where user_id = '${uid(CLIENT)}' and role <> 'client'`) === "0");
  });

  // 3. Administrator: Ομάδα και Administrator με κλειδαριά.
  for (const locale of ["el", "en"]) {
    await as(ADMIN, async (page) => {
      await page.setViewportSize({ width: locale === "el" ? 390 : 1280, height: 900 });
      if (locale === "en") await page.context().addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
      sql(`update users set active_role = 'admin' where phone_number = '+30${ADMIN}'`);
      await go(page, "/platform/board");
      await openRoles(page);
      const rows = await rowsOf(page);
      check(`${locale}: Administrator βλέπει Ομάδα και Administrator`, rows.includes("team:none") && rows.includes("admin:active:current"), rows.join());
      check(`${locale}: εικονίδιο κλειδαριάς στον ρόλο που δεν έχει`, (await page.locator('[data-role-row="team"] svg').count()) >= 2);
      check(`${locale}: ο Administrator τρέχων, με δαχτυλίδι`, (await ring(page)) === RING.admin);
      await page.locator('[data-role-row="team"]').click({ force: true });
      await page.waitForTimeout(400);
      check(`${locale}: η Ομάδα (δεν την έχει) δεν επιλέγεται`, activeRole(ADMIN) === "admin" && page.url().endsWith("/platform/roles"));
      await shoot(page, `roles-admin-${locale}`);
      sql(`update users set active_role = 'client', locale = 'el' where phone_number = '+30${ADMIN}'`);
    });
  }
} finally {
  reset();
}
finish();
