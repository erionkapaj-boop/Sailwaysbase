// Ημερομηνίες, ώρες και «πριν από…» ανά γλώσσα (docs/I18N.md).
//
// Ένα σημείο για όλα: η γλώσσα περνά πάντα ρητά (από το useFormat στον browser,
// από τον χρήστη του email στον διακομιστή). Ποτέ από το `document`: ο
// διακομιστής δεν έχει, και θα έδειχνε πάντα ελληνικά.
//
// Τα ελληνικά έχουν δικούς τους πίνακες (ακριβώς όπως γράφονταν πριν, ώστε
// τίποτα να μην αλλάξει στην οθόνη). Κάθε άλλη γλώσσα παίρνει τα ονόματα
// μηνών και ημερών από το Intl του browser: νέα γλώσσα χωρίς καμία γραμμή
// εδώ. Αν κάποια γλώσσα θέλει δικό της γράψιμο (όπως τα αγγλικά «Sep» αντί
// «Sept»), προστίθεται στο OVERRIDES.

import { DEFAULT_LOCALE, intlLocale } from "./i18n.js";

const OVERRIDES = {
  el: {
    monthsShort: ["Ιαν", "Φεβ", "Μαρ", "Απρ", "Μαΐ", "Ιουν", "Ιουλ", "Αυγ", "Σεπ", "Οκτ", "Νοε", "Δεκ"],
    monthsLong: [
      "Ιανουάριος", "Φεβρουάριος", "Μάρτιος", "Απρίλιος", "Μάιος", "Ιούνιος",
      "Ιούλιος", "Αύγουστος", "Σεπτέμβριος", "Οκτώβριος", "Νοέμβριος", "Δεκέμβριος",
    ],
    // Γενική («24 Σεπτεμβρίου»): η ελληνική την θέλει μπροστά από τον αριθμό της ημέρας.
    monthsGenitive: [
      "Ιανουαρίου", "Φεβρουαρίου", "Μαρτίου", "Απριλίου", "Μαΐου", "Ιουνίου",
      "Ιουλίου", "Αυγούστου", "Σεπτεμβρίου", "Οκτωβρίου", "Νοεμβρίου", "Δεκεμβρίου",
    ],
    // Με σειρά getDay(): Κυριακή πρώτη.
    weekdaysShort: ["Κυρ", "Δευ", "Τρί", "Τετ", "Πέμ", "Παρ", "Σάβ"],
    // Δευτέρα πρώτη, δύο γράμματα: κεφαλίδες ημερολογίου.
    weekdaysMini: ["Δε", "Τρ", "Τε", "Πε", "Πα", "Σα", "Κυ"],
    // Το σύντομο όνομα της ημέρας του μήνα στο shortDay: τα τρία πρώτα γράμματα της γενικής.
    shortDayMonth: (i, genitive) => genitive[i].slice(0, 3),
  },
  en: {
    monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  },
};

const cache = new Map();
function table(locale, kind) {
  const key = `${locale}|${kind}`;
  if (cache.has(key)) return cache.get(key);
  let value = OVERRIDES[locale]?.[kind];
  if (!value) {
    const intl = intlLocale(locale);
    const month = (style) =>
      Array.from({ length: 12 }, (_, i) =>
        new Intl.DateTimeFormat(intl, { month: style, timeZone: "UTC" }).format(new Date(Date.UTC(2026, i, 15)))
      );
    // 2026-02-01 είναι Κυριακή: οι επόμενες 7 ημέρες δίνουν getDay() 0..6.
    const day = (style) =>
      Array.from({ length: 7 }, (_, i) =>
        new Intl.DateTimeFormat(intl, { weekday: style, timeZone: "UTC" }).format(new Date(Date.UTC(2026, 1, 1 + i)))
      );
    value =
      kind === "monthsShort" ? month("short")
      : kind === "monthsLong" ? month("long")
      : kind === "monthsGenitive" ? table(locale, "monthsLong")
      : kind === "weekdaysShort" ? day("short")
      : kind === "weekdaysMini" ? [...day("short")].slice(1).concat(day("short")[0]).map((s) => s.slice(0, 2))
      : null;
  }
  cache.set(key, value);
  return value;
}

export function monthNames(locale, kind = "long") {
  return table(locale, kind === "short" ? "monthsShort" : kind === "genitive" ? "monthsGenitive" : "monthsLong");
}
export function weekdayNames(locale, kind = "short") {
  return table(locale, kind === "mini" ? "weekdaysMini" : "weekdaysShort");
}

// Ημερομηνία χωρίς ώρα («2026-09-25»): ημέρα, μήνας, έτος όπως τα γράφει η
// γλώσσα, χωρίς ζώνη ώρας, ώστε να μην αλλάζει ποτέ η ημέρα. Για τα ελληνικά
// και τα αγγλικά (Ηνωμένου Βασιλείου) βγαίνει «25/09/2026».
export function formatDate(isoDate, locale = DEFAULT_LOCALE) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(intlLocale(locale), { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}

// «25–29 Σεπ 2026», «28 Σεπ – 3 Οκτ 2026», «30 Δεκ 2026 – 2 Ιαν 2027».
export function formatDateRange(startDate, endDate, locale = DEFAULT_LOCALE) {
  if (!startDate || !endDate) return "";
  const M = table(locale, "monthsShort");
  const [y1, m1, d1] = startDate.split("-").map(Number);
  const [y2, m2, d2] = endDate.split("-").map(Number);
  if (y1 === y2 && m1 === m2) {
    return d1 === d2 ? `${d1} ${M[m1 - 1]} ${y1}` : `${d1}–${d2} ${M[m1 - 1]} ${y1}`;
  }
  if (y1 === y2) return `${d1} ${M[m1 - 1]} – ${d2} ${M[m2 - 1]} ${y2}`;
  return `${d1} ${M[m1 - 1]} ${y1} – ${d2} ${M[m2 - 1]} ${y2}`;
}

// Συγκεκριμένη στιγμή (ημερομηνία και ώρα) στην ώρα του χρήστη.
export function formatDateTime(iso, locale = DEFAULT_LOCALE) {
  if (!iso) return "";
  const d = new Date(iso);
  const intl = intlLocale(locale);
  const date = d.toLocaleDateString(intl, { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString(intl, { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

// «πριν 5 λεπτά» / «5 minutes ago». Μετά από 7 ημέρες, η ημερομηνία.
export function timeAgo(iso, locale = DEFAULT_LOCALE, now = Date.now()) {
  if (!iso) return "";
  const secs = Math.floor((now - new Date(iso).getTime()) / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days >= 7) return formatDate(new Date(iso).toISOString().slice(0, 10), locale);

  if (locale === "el") {
    if (secs < 60) return "μόλις τώρα";
    if (mins < 60) return `πριν ${mins} ${mins === 1 ? "λεπτό" : "λεπτά"}`;
    if (hours < 24) return `πριν ${hours} ${hours === 1 ? "ώρα" : "ώρες"}`;
    return `πριν ${days} ${days === 1 ? "ημέρα" : "ημέρες"}`;
  }
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  if (secs < 60) return rtf.format(0, "second");
  if (mins < 60) return rtf.format(-mins, "minute");
  if (hours < 24) return rtf.format(-hours, "hour");
  return rtf.format(-days, "day");
}

function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// «Πέμ 24 Σεπ» / «Thu 24 Sep» — για τις θέσεις Αναχώρηση/Επιστροφή.
export function shortDay(key, locale = DEFAULT_LOCALE) {
  if (!key) return "";
  const d = parseKey(key);
  const weekday = table(locale, "weekdaysShort")[d.getDay()];
  const o = OVERRIDES[locale];
  const month = o?.shortDayMonth ? o.shortDayMonth(d.getMonth(), table(locale, "monthsGenitive")) : table(locale, "monthsShort")[d.getMonth()];
  return `${weekday} ${d.getDate()} ${month}`;
}

// «24 Σεπτεμβρίου 2026» / «24 September 2026» — για πεδία φόρμας.
export function longDay(key, locale = DEFAULT_LOCALE) {
  if (!key) return "";
  const d = parseKey(key);
  return `${d.getDate()} ${table(locale, "monthsGenitive")[d.getMonth()]} ${d.getFullYear()}`;
}
