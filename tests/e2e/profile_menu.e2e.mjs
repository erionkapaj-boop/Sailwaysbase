// Avatar και μενού προφίλ: η φωτογραφία (ή τα αρχικά) με δαχτυλίδι στο χρώμα του ρόλου, μενού με στοιχεία, τρέχοντα ρόλο και τις γραμμές
// του ρόλου (lib/platform/roleEnv.js) και αποσύνδεση. Κινητό και υπολογιστής, ελληνικά και αγγλικά.
import { as, go, check, finish, shoot, sql, BASE, eventually, resetRoles } from "./lib.mjs";

const CLIENT = "6900002002"; // Μαρία Πελάτη
const SKIPPER = "6900002003"; // Νίκος Αρχικός
const ADMIN = "6900002001";

const COLORS = { client: "rgb(111, 155, 200)", professional: "rgb(195, 161, 100)", admin: "rgb(210, 119, 108)" };
resetRoles();

async function menuState(page) {
  return page.evaluate(() => {
    const btn = document.querySelector("[data-profile-menu]");
    const ring = document.querySelector("[data-profile-menu] [data-role-ring]");
    const pop = document.querySelector("[data-profile-pop]");
    const r = pop?.getBoundingClientRect();
    return {
      has: Boolean(btn),
      role: btn?.getAttribute("data-active-role"),
      ring: ring ? getComputedStyle(ring).borderTopColor : null,
      ringW: ring ? parseFloat(getComputedStyle(ring).borderTopWidth) : 0,
      btnBox: btn ? (({ x, y, width, height }) => ({ x, y, width, height }))(btn.getBoundingClientRect()) : null,
      pop: pop ? { text: pop.textContent.replace(/\s+/g, " "), x: r.x, y: r.y, right: r.right, bottom: r.bottom } : null,
      items: [...document.querySelectorAll("[data-profile-pop] [data-pm-item]")].map((a) => a.dataset.pmItem),
      vw: window.innerWidth, vh: window.innerHeight,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      signInLink: document.querySelectorAll('[data-sf-header] a[href="/platform/login"]').length,
    };
  });
}

const L = {
  el: { role: { client: "Πελάτης", professional: "Επαγγελματίας πληρώματος", admin: "Administrator" }, cur: "Τρέχων ρόλος", change: "Αλλαγή ρόλου", item: { bookings: "Κρατήσεις", settings: "Ρυθμίσεις", packages: "Πακέτα & προνόμια", help: "Βοήθεια" }, logout: "Αποσύνδεση", gone: ["Το προφίλ μου", "Αιτήματα", "Η διαθεσιμότητά μου"] },
  en: { role: { client: "Client", professional: "Crew professional", admin: "Administrator" }, cur: "Current role", change: "Change role", item: { bookings: "Bookings", settings: "Settings", packages: "Packages & benefits", help: "Help" }, logout: "Sign out", gone: ["My profile", "Requests", "My availability"] },
};
const MENU = { client: ["bookings", "settings", "packages", "help"], professional: ["bookings", "settings", "packages", "help"], admin: ["help"] };

for (const locale of ["el", "en"]) {
  for (const [who, phone, role] of [["client", CLIENT, "client"], ["skipper", SKIPPER, "professional"], ["admin", ADMIN, "admin"]]) {
    for (const vw of [390, 1280]) {
      if (locale === "en" && who !== "client" && vw === 390) continue;
      await as(phone, async (page) => {
        await page.setViewportSize({ width: vw, height: vw === 390 ? 844 : 900 });
        if (locale === "en") await page.context().addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
        await go(page, role === "admin" ? "/platform/admin" : "/platform/board");
        const tag = `${locale}/${who}/${vw}`;
        await eventually(async () => (await menuState(page)).has);
        let s = await menuState(page);
        check(`${tag}: avatar στη θέση του «Σύνδεση», όχι σύνδεσμος σύνδεσης`, s.has && s.signInLink === 0, JSON.stringify(s));
        check(`${tag}: δαχτυλίδι στο χρώμα του ρόλου`, s.role === role && s.ring === COLORS[role] && s.ringW > 0 && s.ringW <= 2, JSON.stringify(s));
        check(`${tag}: αφή ≥ 44px και μέσα στην οθόνη`, s.btnBox.height >= 44 && s.btnBox.width >= 44 && s.btnBox.x + s.btnBox.width <= vw && s.overflow === 0, JSON.stringify(s));
        await page.locator("[data-profile-menu]").click();
        await page.locator("[data-profile-pop]").waitFor();
        await page.waitForTimeout(350);
        s = await menuState(page);
        const t = s.pop.text;
        check(`${tag}: όνομα, ρόλος, τρέχων ρόλος, «${L[locale].change}»`,
          t.includes(L[locale].role[role]) && t.includes(L[locale].cur) && t.includes(L[locale].change) && (await page.locator("[data-pm-name]").innerText()).length > 2, t);
        check(`${tag}: μόνο οι γραμμές του ρόλου (${MENU[role].join(", ")})`, s.items.join() === MENU[role].join() && MENU[role].every((k) => t.includes(L[locale].item[k])), `${s.items.join()} / ${t}`);
        check(`${tag}: τίποτα διπλό από τις καρτέλες (Προφίλ, Αιτήματα, Διαθεσιμότητα)`, L[locale].gone.every((x) => !t.includes(x)), t);
        if (MENU[role].includes("packages")) check(`${tag}: υπόλοιπο credits δίπλα στα πακέτα`, /\d+ credits?/.test(await page.locator("[data-pm-balance]").innerText()));
        else check(`${tag}: χωρίς πακέτα/ρυθμίσεις/κρατήσεις στον ρόλο`, !t.includes(L[locale].item.packages) && !t.includes(L[locale].item.settings) && !t.includes(L[locale].item.bookings), t);
        check(`${tag}: το μενού μένει μέσα στην οθόνη`, s.pop.x >= 0 && s.pop.right <= vw + 0.5 && s.pop.y >= 0 && s.pop.bottom <= s.vh, JSON.stringify(s.pop));
        const order = await page.evaluate(() => [...document.querySelectorAll("[data-profile-pop] a, [data-profile-pop] button")].map((e) => e.innerText.replace(/\s+/g, " ").trim()).filter(Boolean));
        check(`${tag}: «${L[locale].logout}» τελευταία`, order[order.length - 1] === L[locale].logout, JSON.stringify(order));
        if (who === "client" && ((locale === "el" && vw === 390) || (locale === "el" && vw === 1280) || (locale === "en" && vw === 1280))) await shoot(page, `profile-menu-${locale}-${vw}`);
        await page.keyboard.press("Escape");
        await page.locator("[data-profile-pop]").waitFor({ state: "detached" });
        check(`${tag}: Escape κλείνει το μενού`, true);
      });
    }
  }
}


resetRoles(); // επαναφέρει και τη γλώσσα των λογαριασμών (τα αγγλικά τρεξίματα την γράφουν στον χρήστη)

// Σύνδεσμοι: Ρυθμίσεις και Βοήθεια → οθόνη «Σύντομα»· πακέτα → credits· η «Αλλαγή ρόλου» ανοίγει την οθόνη «Οι ρόλοι μου».
await as(CLIENT, async (page) => {
  await go(page, "/platform/board");
  const open = async () => { await page.locator("[data-profile-menu]").click(); await page.locator("[data-profile-pop]").waitFor(); };
  await open();
  await page.getByRole("menuitem", { name: /Ρυθμίσεις/ }).click();
  await page.waitForURL(/\/platform\/settings/);
  await page.waitForLoadState("networkidle");
  check("Ρυθμίσεις → «Σύντομα»", (await page.innerText("body")).includes("Σύντομα"));
  await open();
  await page.getByRole("menuitem", { name: /Βοήθεια/ }).click();
  await page.waitForURL(/\/platform\/help/);
  check("Βοήθεια → «Σύντομα»", (await page.innerText("body")).includes("Σύντομα"));
  await open();
  await page.getByRole("menuitem", { name: /Πακέτα/ }).click();
  await page.waitForURL(/\/platform\/wallet/);
  check("Πακέτα & προνόμια → credits", true);
  await open();
  await page.getByRole("menuitem", { name: "Αποσύνδεση" }).click();
  await page.waitForURL((u) => u.pathname === "/platform");
  await page.waitForLoadState("networkidle");
  check("Αποσύνδεση → επισκέπτης με «Σύνδεση»", (await page.getByRole("link", { name: "Σύνδεση" }).count()) >= 1);
});

// Ο ρόλος που ορίζει η βάση (users.active_role) ορίζει το χρώμα του δαχτυλιδιού και τον τίτλο στο μενού.
await as(SKIPPER, async (page) => {
  sql(`update users set active_role='client' where phone_number='+30${SKIPPER}'`);
  await go(page, "/platform/board");
  await eventually(async () => (await menuState(page)).role === "client");
  check("τρέχων ρόλος Πελάτης (από τη βάση): ring Πελάτη", (await menuState(page)).ring === COLORS.client);
  sql(`update users set active_role='professional' where phone_number='+30${SKIPPER}'`);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await eventually(async () => (await menuState(page)).role === "professional");
  check("τρέχων ρόλος Επαγγελματίας: ring άμμος", (await menuState(page)).ring === COLORS.professional);
  resetRoles();
});
finish();
