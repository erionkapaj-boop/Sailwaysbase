// Δύο εφαρμογές, δύο εικονίδια: το SkipperFinder (/platform) έχει δικό του
// κυκλικό εικονίδιο, και το Base Manager (/) κρατά το δικό του.
import { BASE, check, finish } from "./lib.mjs";

const html = async (p) => (await fetch(BASE + p)).text();
const links = (h) => [...h.matchAll(/<link[^>]+>/g)].map((m) => m[0]).filter((l) => /rel="(icon|apple-touch-icon|manifest)"/.test(l)).join(" ");

const sf = links(await html("/platform/login"));
check("SkipperFinder: εικονίδιο καρτέλας δικό του", /skipperfinder-icon-32\.png/.test(sf) && /skipperfinder-icon-192\.png/.test(sf), sf);
check("SkipperFinder: εικονίδιο αρχικής οθόνης iOS δικό του", /skipperfinder-apple-touch-icon\.png/.test(sf), sf);
check("SkipperFinder: κανένα εικονίδιο του Base Manager", !/(?<!skipperfinder-)(icon-192|icon-512|apple-touch-icon)\.png/.test(sf), sf);
check("SkipperFinder: δικό του manifest", /platform-manifest\.json/.test(sf), sf);

const bm = links(await html("/"));
check("Base Manager: κρατά το δικό του εικονίδιο", /\/icon-192\.png/.test(bm) && /\/apple-touch-icon\.png/.test(bm) && !/skipperfinder/.test(bm), bm);

const manifest = await (await fetch(BASE + "/platform-manifest.json")).json();
const srcs = manifest.icons.map((i) => i.src);
check("manifest SkipperFinder: μόνο δικά του εικονίδια", srcs.length >= 2 && srcs.every((s) => s.startsWith("/skipperfinder-")), srcs.join(","));
for (const s of [...srcs, "/skipperfinder-icon-32.png", "/skipperfinder-apple-touch-icon.png", "/icon-192.png"]) {
  const r = await fetch(BASE + s);
  check(`${s} υπάρχει (PNG)`, r.ok && (r.headers.get("content-type") || "").includes("image/png"));
}
finish();
