// Στυλ του χάρτη. Με NEXT_PUBLIC_MAP_URL (ο δικός μας διακομιστής χάρτη, βλ.
// docs/MAP_PLAN.md): πραγματικός χάρτης από OpenStreetMap, με ονόματα στη γλώσσα
// της σελίδας. Χωρίς αυτό (τεστ, τοπική ανάπτυξη): απλό υπόβαθρο χωρίς δίκτυο,
// με την ίδια διεπαφή, ώστε ό,τι χτίζεται πάνω στον χάρτη να δοκιμάζεται παντού.
import { layers, namedFlavor } from "@protomaps/basemaps";
import { colors } from "./theme.js";

export const MAP_URL = (process.env.NEXT_PUBLIC_MAP_URL || "").replace(/\/+$/, "");

export function mapStyle({ baseUrl = MAP_URL, lang = "el" } = {}) {
  if (!baseUrl) {
    return {
      version: 8,
      sources: {},
      layers: [{ id: "background", type: "background", paint: { "background-color": "#E4ECEF" } }],
    };
  }
  return {
    version: 8,
    glyphs: `${baseUrl}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${baseUrl}/sprites/light`,
    sources: { protomaps: { type: "vector", url: `${baseUrl}/tiles.json`, attribution: "© OpenStreetMap" } },
    layers: layers("protomaps", namedFlavor("light"), { lang }),
  };
}

// Χρώματα των στρωμάτων (από τα tokens της εφαρμογής).
export const MAP_COLORS = { point: colors.ink, pointRing: "#FFFFFF", accent: colors.accent, review: colors.warn, pick: colors.accent };
