import { DEFAULT_LOCALE } from "./i18n.js";
import { COUNTRIES, PLACES, REGION_INFO } from "./places.js";
import { greekToLatin, hasGreek } from "./translit.js";
import * as en from "./localData/en.js";

// Δεδομένα που ζουν στη βάση (ή στα αρχεία των χωρών) ως ελληνικό κείμενο:
// τόποι, περιοχές, χώρες, τύποι σκαφών, γλώσσες, εθνικότητες, ονόματα ανθρώπων,
// κείμενα που γράφει η ίδια η βάση. Δείχνονται πάντα στη γλώσσα της σελίδας
// (docs/I18N.md §7): λεξικό της γλώσσας (localData/<γλώσσα>.js, με τα πεδία `en`
// των τόπων) και, για ό,τι δεν έχει λεξικό (π.χ. όνομα ανθρώπου), μεταγραφή
// με το πρότυπο των διαβατηρίων. Ποτέ ελληνικά γράμματα σε άλλη γλώσσα.
//
// ΜΟΝΟ για δεδομένα. Ελεύθερο κείμενο που έγραψε χρήστης (μήνυμα, σημείωση, λόγος
// ακύρωσης) δείχνεται όπως γράφτηκε και σημαίνεται με data-user-text.

const DICTS = { en };

function build(locale) {
  const d = DICTS[locale];
  if (!d) return null;
  const map = new Map();
  const add = (obj) => {
    for (const [k, v] of Object.entries(obj)) map.set(k, v);
  };
  add(d.BOAT_TYPES);
  add(d.LANGUAGES);
  add(d.NATIONALITIES);
  add(d.SYSTEM_TEXT);
  add(d.FLOWS);
  // Τόποι, περιοχές και χώρες από τα αρχεία των χωρών (πεδίο en).
  for (const c of COUNTRIES) if (c.en) map.set(c.name, c.en);
  for (const [name, info] of Object.entries(REGION_INFO)) if (info.en) map.set(name, info.en);
  for (const p of PLACES) if (p.en && !p.child) map.set(p.name, p.en);
  return map;
}

const cache = new Map();
function dict(locale) {
  if (!cache.has(locale)) cache.set(locale, build(locale));
  return cache.get(locale);
}

const SEPARATORS = /(\s*[()·,→–—|/]\s*|\s+-\s+)/;

function localizeSegment(segment, locale, map) {
  const text = segment.trim();
  if (!text || !hasGreek(text)) return segment;
  const lead = segment.slice(0, segment.indexOf(text));
  const trail = segment.slice(segment.indexOf(text) + text.length);
  if (map?.has(text)) return lead + map.get(text) + trail;
  const prefixes = DICTS[locale]?.SYSTEM_PREFIXES || {};
  for (const [gr, tr] of Object.entries(prefixes)) {
    if (text.startsWith(gr)) return lead + tr + localizeSegment(text.slice(gr.length), locale, map) + trail;
  }
  return lead + greekToLatin(text) + trail;
}

// «Άλιμος (Σαρωνικός) · Ιστιοπλοϊκό» → «Alimos (Saronic Gulf) · Sailboat».
export function localizeData(text, locale = DEFAULT_LOCALE) {
  if (text == null || text === "") return text ?? "";
  const s = String(text);
  if (locale === DEFAULT_LOCALE || !hasGreek(s)) return s;
  const map = dict(locale);
  return s
    .split(SEPARATORS)
    .map((part, i) => (i % 2 === 1 ? part : localizeSegment(part, locale, map)))
    .join("");
}

// Όνομα ανθρώπου: στα ελληνικά όπως γράφτηκε· αλλού το λατινικό της βάσης (ΕΛΟΤ 743,
// full_name_latin) ή, αν η εγγραφή δεν το φέρνει, η ίδια μεταγραφή.
export function displayName(person, locale = DEFAULT_LOCALE) {
  if (!person) return "";
  if (locale === DEFAULT_LOCALE) return person.full_name || "";
  return person.full_name_latin || localizeName(person.full_name || "", locale);
}

// Όνομα που έρχεται ως απλό κείμενο: μόνο μεταγραφή, ποτέ λεξικό (ένα επώνυμο
// δεν πρέπει να «μεταφράζεται» επειδή μοιάζει με λιμάνι).
export function localizeName(text, locale = DEFAULT_LOCALE) {
  const s = text == null ? "" : String(text);
  if (locale === DEFAULT_LOCALE || !hasGreek(s)) return s;
  return greekToLatin(s);
}

export function hasLocalData(locale) {
  return locale === DEFAULT_LOCALE || Boolean(DICTS[locale]);
}
