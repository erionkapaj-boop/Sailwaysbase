// Εικονίδια του SkipperFinder: το τιμόνι της εφαρμογής (app/platform/components/Logo.js)
// μέσα σε λευκό κυκλικό φόντο. Βγάζει τα αρχεία του /public που χρησιμοποιεί ΜΟΝΟ
// το SkipperFinder (καρτέλα browser, αρχική οθόνη κινητού)· το εικονίδιο του
// Base Manager (icon-192.png κ.λπ.) δεν αγγίζεται.
//
//   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/make-platform-icons.mjs
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require("../tests/e2e/node_modules/playwright");

const INK = "#16283C", ACCENT = "#C3A164", PAPER = "#FAF8F4", RING = "#DAD5CB";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

// kind "circle": διάφανες γωνίες (καρτέλα, Android). kind "square": γεμάτο
// τετράγωνο για το iOS, που στρογγυλεύει μόνο του και βάζει μαύρο σε διαφάνεια.
const svg = (size, kind) => {
  const c = size / 2, r = size / 2 - Math.max(1, size * 0.012);
  const wheel = (size * 0.78) / 24; // ο τροχός στο 78% της διαμέτρου (μεγάλος, για να διαβάζεται και στα 32px)
  const sw = 1.55; // λίγο παχύτερη γραμμή από το λογότυπο, για μικρά μεγέθη
  const spokes = [0, 45, 90, 135]
    .map((d) => `<line x1="12" y1="2.4" x2="12" y2="21.6" stroke="${INK}" stroke-width="${sw}" stroke-linecap="round" transform="rotate(${d} 12 12)"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${kind === "square" ? `<rect width="${size}" height="${size}" fill="${PAPER}"/>` : ""}
    <circle cx="${c}" cy="${c}" r="${r}" fill="#fff" stroke="${RING}" stroke-width="${Math.max(1, size * 0.008)}"/>
    <g transform="translate(${c - 12 * wheel} ${c - 12 * wheel}) scale(${wheel})" fill="none">
      <circle cx="12" cy="12" r="7.25" stroke="${INK}" stroke-width="${sw}"/>
      ${spokes}
      <circle cx="12" cy="12" r="2.6" fill="${ACCENT}"/>
    </g></svg>`;
};

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
const jobs = [
  ["skipperfinder-icon-192.png", 192, "circle"],
  ["skipperfinder-icon-512.png", 512, "circle"],
  ["skipperfinder-icon-32.png", 32, "circle"],
  ["skipperfinder-apple-touch-icon.png", 180, "square"],
];
for (const [file, size, kind] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:transparent">${svg(size, kind)}</body>`);
  await page.screenshot({ path: path.join(OUT, file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log("ok  ", file);
}
await browser.close();
