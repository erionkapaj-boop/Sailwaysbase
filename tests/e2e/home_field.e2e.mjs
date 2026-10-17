// Αρχική (βήμα 5): το πεδίο αναζήτησης «Πού θα ταξιδέψεις;» (φακός αριστερά, βελάκι δεξιά, πάτημα οπουδήποτε → πρώτο βήμα του αιτήματος)
// και το «Ανακάλυψε εμπειρίες στη θάλασσα» χωρίς βελάκι. Ίδια αρχική για όλους τους ρόλους, κινητό και υπολογιστής, ελληνικά και αγγλικά.
import { as, go, check, finish, shoot, sql, BASE } from "./lib.mjs";

const CLIENT = "6900002002";
const SKIPPER = "6900002003";
const ADMIN = "6900002001";
const T = {
  el: { where: "Πού θα ταξιδέψεις;", exp: "Ανακάλυψε εμπειρίες στη θάλασσα", tag: "Οι άνθρωποι πίσω από κάθε ταξίδι." },
  en: { where: "Where are you travelling?", exp: "Discover experiences at sea", tag: "The people behind every voyage." },
};
const reset = () => sql("update users set active_role = 'client', locale = 'el'");
reset();

const shape = (page) => page.evaluate(() => {
  const f = document.querySelector("[data-home-search]");
  const r = f.getBoundingClientRect();
  const svgs = [...f.querySelectorAll("svg")].map((s) => s.getBoundingClientRect());
  const label = f.querySelector("span").getBoundingClientRect();
  const link = [...document.querySelectorAll("a")].find((a) => a.getAttribute("href") === "/platform/experiences");
  return {
    field: { x: r.x, y: r.y, w: r.width, h: r.height, radius: parseFloat(getComputedStyle(f).borderTopLeftRadius) },
    magnifierLeft: svgs.length === 2 && svgs[0].x < label.x && svgs[0].x - r.x < 40,
    arrowRight: svgs.length === 2 && svgs[1].x > label.x + label.width * 0.3 && r.right - svgs[1].right < 48 && svgs[1].width <= 20,
    text: f.innerText.trim(),
    expSvg: link ? link.querySelectorAll("svg").length : -1,
    expText: link ? link.innerText.trim() : "",
    logo: Boolean(document.querySelector("svg")),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});

try {
  for (const [who, phone] of [["πελάτης", CLIENT], ["επαγγελματίας", SKIPPER], ["διαχειριστής", ADMIN]]) {
    for (const [locale, vw] of [["el", 390], ["el", 1280], ["en", 390]]) {
      await as(phone, async (page) => {
        await page.setViewportSize({ width: vw, height: vw === 390 ? 844 : 900 });
        if (locale === "en") await page.context().addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
        await go(page, "/platform");
        const tag = `${who}, ${locale}, ${vw}`;
        const s = await shape(page);
        check(`${tag}: πεδίο με κείμενο «${T[locale].where}»`, s.text === T[locale].where, s.text);
        check(`${tag}: φακός αριστερά, μικρό βελάκι δεξιά`, s.magnifierLeft && s.arrowRight, JSON.stringify(s));
        check(`${tag}: σχήμα πεδίου: στρογγυλό, ≥ 60px ύψος, χωρίς κύλιση`, s.field.h >= 60 && s.field.radius >= 30 && s.overflow === 0, JSON.stringify(s.field));
        check(`${tag}: «${T[locale].exp}» χωρίς βελάκι`, s.expText === T[locale].exp && s.expSvg === 0, `${s.expText} / svg ${s.expSvg}`);
        const body = await page.innerText("body");
        check(`${tag}: το σλόγκαν όπως είναι`, body.includes(T[locale].tag));
        if (who === "πελάτης") await shoot(page, `home-field-${locale}-${vw}`);
        // Πάτημα οπουδήποτε στο πεδίο: αριστερά, μέση, δεξιά.
        for (const [where, fx] of [["αριστερά", 0.04], ["μέση", 0.5], ["δεξιά", 0.96]]) {
          await go(page, "/platform");
          const f = await page.locator("[data-home-search]").boundingBox();
          await page.mouse.click(f.x + f.width * fx, f.y + f.height / 2);
          await page.locator("[data-sf-wizard]").waitFor({ timeout: 5000 }).catch(() => {});
          const w = await page.innerText("body");
          check(`${tag}: πάτημα ${where} → ξεκινά η ροή αιτήματος στο πρώτο βήμα`, (await page.locator("[data-sf-wizard]").count()) > 0 && w.includes(T[locale].where) && (await page.locator("[data-home-search]").count()) === 0);
        }
      });
      reset();
    }
  }
} finally {
  reset();
}
finish();
