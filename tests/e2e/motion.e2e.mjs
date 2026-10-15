// Κανόνας κίνησης (docs/DESIGN.md «Κίνηση»): scroll ήπιο, ~240ms ease-out στα βασικά στοιχεία, και χωρίς κίνηση όταν
// το σύστημα ζητά «λιγότερη κίνηση».
import { chromium } from "playwright";
import { BASE, check, finish } from "./lib.mjs";

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const [label, reduced] of [["κανονική κίνηση", "no-preference"], ["λιγότερη κίνηση", "reduce"]]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: reduced });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/platform`);
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const btn = document.querySelector(".platform-scope button");
    return {
      scroll: getComputedStyle(document.documentElement).scrollBehavior,
      duration: btn ? getComputedStyle(btn).transitionDuration : "",
      token: getComputedStyle(document.documentElement).getPropertyValue("--sf-motion-ms").trim(),
    };
  });
  if (reduced === "no-preference") {
    check(`${label}: scroll ήπιο`, info.scroll === "smooth", info.scroll);
    check(`${label}: τα κουμπιά αλλάζουν σε ~240ms`, info.duration.split(",").every((d) => Math.abs(parseFloat(d) * (d.includes("ms") ? 1 : 1000) - 240) < 5) && info.token === "240ms", `${info.duration} / ${info.token}`);
  } else {
    check(`${label}: scroll χωρίς κίνηση`, info.scroll === "auto", info.scroll);
    check(`${label}: οι μεταβάσεις σχεδόν στιγμιαίες`, info.duration.split(",").every((d) => parseFloat(d) * (d.includes("ms") ? 1 : 1000) < 1), info.duration);
  }
  await ctx.close();
}
await browser.close();
finish();
