// Languages as ISO 639-1 codes (two letters) plus "fil" (Filipino). The client's choice is kept as
// codes; names (Greek and English) come from Intl.DisplayNames, and for the 29 languages the database
// has, from the localData catalogue (so they do not vary by browser).
// Professionals declare languages from the database table "languages"; matching is done by name.
import { LANGUAGES } from "./localData/en.js";

export const ISO_639_1 =
  "aa ab ae af ak am an ar as av ay az ba be bg bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nd ne ng nl no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu fil".split(" ");

// The languages of the database table (code → English name).
const CURATED = {
  el: "Greek", en: "English", de: "German", fr: "French", it: "Italian", es: "Spanish", nl: "Dutch", pt: "Portuguese",
  sv: "Swedish", no: "Norwegian", da: "Danish", fi: "Finnish", pl: "Polish", cs: "Czech", sk: "Slovak", hu: "Hungarian",
  ro: "Romanian", bg: "Bulgarian", hr: "Croatian", sl: "Slovenian", sr: "Serbian", uk: "Ukrainian", ru: "Russian",
  tr: "Turkish", ar: "Arabic", he: "Hebrew", zh: "Chinese", ja: "Japanese", ko: "Korean",
};
const GREEK_NAME = Object.fromEntries(Object.entries(LANGUAGES).map(([gr, en]) => [en, gr]));
const CODE_BY_EN = Object.fromEntries(Object.entries(CURATED).map(([code, en]) => [en, code]));
const DB_SPECIAL = { "Indian languages": "hi" };

export const isLanguageCode = (x) => /^[a-z]{2,3}$/.test(String(x || ""));

// A language name as stored in the database table (Greek) → code, or null.
export function languageCodeOfDbName(name) {
  const en = LANGUAGES[name];
  return (en && (DB_SPECIAL[en] || CODE_BY_EN[en])) || null;
}

const displayNames = {};
function display(locale, code) {
  try {
    displayNames[locale] = displayNames[locale] || new Intl.DisplayNames([locale], { type: "language" });
    const n = displayNames[locale].of(code);
    return n && n !== code ? n : null;
  } catch {
    return null;
  }
}

// locale: "el" or "en".
export function languageLabel(code, locale) {
  if (CURATED[code]) return locale === "el" ? GREEK_NAME[CURATED[code]] : CURATED[code];
  return display(locale, code) || display("en", code) || code.toUpperCase();
}

const COMMON = ["en", "el", "de", "fr", "it", "es"];
const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\u03c2/g, "\u03c3")
    .trim();

let index = null;
function buildIndex() {
  index = ISO_639_1.map((code) => {
    const el = languageLabel(code, "el");
    const en = languageLabel(code, "en");
    return { code, el, en, keys: [norm(el), norm(en)] };
  }).filter((e) => e.en !== e.code.toUpperCase() || CURATED[e.code]);
}

// Search in Greek and English, ignoring accents and case: typing the first letters of the Greek or
// the English name finds the same language. Prefix matches first, then word-start, then substring.
export function searchLanguages(query, { exclude = [], limit = 6 } = {}) {
  const q = norm(query);
  if (q.length < 2) return [];
  if (!index) buildIndex();
  const skip = new Set(exclude);
  const scored = [];
  for (const e of index) {
    if (skip.has(e.code)) continue;
    let best = 9;
    for (const k of e.keys) {
      if (k.startsWith(q)) best = Math.min(best, 0);
      else if (k.split(/[\s,()-]+/).some((w) => w.startsWith(q))) best = Math.min(best, 1);
      else if (k.includes(q)) best = Math.min(best, 2);
    }
    if (best < 9) scored.push({ e, best });
  }
  const common = (c) => (COMMON.includes(c) ? COMMON.indexOf(c) : COMMON.length);
  scored.sort((a, b) => a.best - b.best || common(a.e.code) - common(b.e.code) || a.e.en.localeCompare(b.e.en));
  return scored.slice(0, limit).map((s) => s.e.code);
}
