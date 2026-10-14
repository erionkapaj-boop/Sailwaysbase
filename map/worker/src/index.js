// Διακομιστής χαρτών του SkipperFinder: Cloudflare Worker πάνω σε R2.
//
//   GET /health                       → "ok"
//   GET /tiles.json                   → TileJSON (για το MapLibre)
//   GET /tiles/{z}/{x}/{y}.mvt        → πλακίδιο από το greece.pmtiles
//   GET /fonts/{fontstack}/{range}.pbf→ γραμματοσειρές (glyphs)
//   GET /sprites/{όνομα}.json|.png    → εικονίδια του στυλ
//
// Τα πλακίδια διαβάζονται με range requests μέσα από ένα μόνο αρχείο PMTiles.
// Όλα στο R2 μας: κανένας τρίτος δεν βλέπει ποιος άνοιξε τον χάρτη.
import { PMTiles, Compression, EtagMismatch, ResolvedValueCache } from "pmtiles";

const TILE_CACHE = new ResolvedValueCache(25);

class R2Source {
  constructor(env) {
    this.env = env;
    this.key = env.ARCHIVE || "greece.pmtiles";
  }
  getKey() {
    return this.key;
  }
  async getBytes(offset, length, signal, etag) {
    const resp = await this.env.MAPS.get(this.key, { range: { offset, length }, onlyIf: { etagMatches: etag } });
    if (!resp) throw new Error("Το αρχείο χάρτη δεν υπάρχει στο R2");
    if (!resp.body) throw new EtagMismatch();
    return { data: await resp.arrayBuffer(), etag: resp.etag, cacheControl: resp.httpMetadata?.cacheControl };
  }
}

function originAllowed(origin, env) {
  if (!origin) return false;
  const list = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.includes(origin)) return true;
  try {
    const { hostname, protocol } = new URL(origin);
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;
    if (protocol === "https:" && hostname.endsWith(".vercel.app")) return true;
  } catch {
    return false;
  }
  return false;
}

function cors(origin, env) {
  return originAllowed(origin, env) ? { "access-control-allow-origin": origin, vary: "Origin" } : { vary: "Origin" };
}

const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    const base = cors(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { ...base, "access-control-allow-methods": "GET, HEAD, OPTIONS", "access-control-max-age": "86400" } });
    }
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: base });
    if (url.pathname === "/health") return new Response("ok", { headers: { ...base, "cache-control": "no-store" } });

    // Αν ο χάρτης φορτώνεται από άλλο domain, δεν σερβίρουμε (προστασία του ορίου χρήσης).
    if (origin && !originAllowed(origin, env)) return new Response("Forbidden", { status: 403, headers: base });

    const cacheKey = new Request(url.toString(), { method: "GET" });
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) {
      const r = new Response(hit.body, hit);
      Object.entries(base).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }

    let response;
    try {
      response = await route(url, env);
    } catch (err) {
      return json({ error: String(err?.message || err) }, 500, base);
    }
    const out = new Response(response.body, response);
    Object.entries(base).forEach(([k, v]) => out.headers.set(k, v));
    if (out.status === 200) ctx.waitUntil(cache.put(cacheKey, out.clone()));
    return out;
  },
};

async function route(url, env) {
  const p = url.pathname;

  if (p === "/tiles.json") {
    const header = await new PMTiles(new R2Source(env), TILE_CACHE).getHeader();
    return json(
      {
        tilejson: "3.0.0",
        scheme: "xyz",
        tiles: [`${url.origin}/tiles/{z}/{x}/{y}.mvt`],
        minzoom: header.minZoom,
        maxzoom: header.maxZoom,
        bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
        attribution: "© OpenStreetMap",
      },
      200,
      { "cache-control": "public, max-age=3600" }
    );
  }

  const tile = p.match(/^\/tiles\/(\d+)\/(\d+)\/(\d+)\.mvt$/);
  if (tile) {
    const [z, x, y] = tile.slice(1).map(Number);
    const archive = new PMTiles(new R2Source(env), TILE_CACHE);
    const header = await archive.getHeader();
    if (z < header.minZoom || z > header.maxZoom) return new Response(null, { status: 204 });
    const data = await archive.getZxy(z, x, y);
    if (!data) return new Response(null, { status: 204 });
    const headers = { "content-type": "application/x-protobuf", "cache-control": "public, max-age=86400" };
    if (header.tileCompression === Compression.Gzip) headers["content-encoding"] = "gzip";
    return new Response(data.data, { headers });
  }

  const font = p.match(/^\/fonts\/([^/]+)\/([0-9]+-[0-9]+)\.pbf$/);
  if (font) {
    const key = `fonts/${decodeURIComponent(font[1])}/${font[2]}.pbf`;
    const obj = await env.MAPS.get(key);
    if (!obj) return new Response("Not found", { status: 404 });
    return new Response(obj.body, { headers: { "content-type": "application/x-protobuf", "cache-control": "public, max-age=604800" } });
  }

  const sprite = p.match(/^\/sprites\/([A-Za-z0-9_@.-]+\.(json|png))$/);
  if (sprite) {
    const obj = await env.MAPS.get(`sprites/${sprite[1]}`);
    if (!obj) return new Response("Not found", { status: 404 });
    const type = sprite[2] === "png" ? "image/png" : "application/json";
    return new Response(obj.body, { headers: { "content-type": type, "cache-control": "public, max-age=604800" } });
  }

  return new Response("Not found", { status: 404 });
}
