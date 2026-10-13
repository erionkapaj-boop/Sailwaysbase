// Η ΜΟΝΗ πηγή αλήθειας για τις γλώσσες της πλατφόρμας (docs/I18N.md).
//
// Νέα γλώσσα = μία γραμμή στο LANGUAGES + ένα αρχείο messages/xx.json. Τίποτα
// άλλο δεν ξέρει ποιες γλώσσες υπάρχουν: το κουμπί γλώσσας, ο διακομιστής, τα
// emails και οι έλεγχοι διαβάζουν από εδώ.
//
// Ποιες γλώσσες είναι ΑΝΟΙΧΤΕΣ στους χρήστες το ορίζει η μεταβλητή
// NEXT_PUBLIC_PLATFORM_LOCALES (π.χ. "el,en"), όχι ο κώδικας. Προεπιλογή: "el".
// Όσο μια γλώσσα δεν είναι ανοιχτή δεν φαίνεται πουθενά, ούτε στο κουμπί ούτε
// ως προεπιλογή domain. Το build αρνείται να ανοίξει γλώσσα που δεν είναι
// πλήρης (scripts/check-i18n.mjs): μισή μετάφραση δεν φτάνει ποτέ σε χρήστη.

export const DEFAULT_LOCALE = "el";
export const LOCALE_COOKIE = "sf_locale";

// code: κωδικός ISO· name: το όνομα στη δική της γλώσσα (πάντα έτσι, ώστε
// όποιος δεν διαβάζει τη γλώσσα της σελίδας να βρίσκει τη δική του)·
// short: τι γράφεται δίπλα στη σημαία· intl: για ημερομηνίες και αριθμούς·
// flag: ποια σημαία δείχνει το κουμπί (components/Flags.js).
export const LANGUAGES = {
  el: { code: "el", name: "Ελληνικά", short: "EL", intl: "el-GR", flag: "gr" },
  en: { code: "en", name: "English", short: "EN", intl: "en-GB", flag: "gb" },
};

// Domain που ανοίγουν σε συγκεκριμένη γλώσσα όταν κανείς δεν έχει διαλέξει.
// Ισχύει μόνο αν η γλώσσα είναι ανοιχτή· αλλιώς αγνοείται.
export const HOST_DEFAULTS = {
  "skipperfinder.com": "en",
  "www.skipperfinder.com": "en",
};

// Η διαδρομή του `process.env.NEXT_PUBLIC_…` πρέπει να είναι γραμμένη αυτούσια,
// αλλιώς το Next δεν την αντικαθιστά στον browser.
function configured() {
  return process.env.NEXT_PUBLIC_PLATFORM_LOCALES || DEFAULT_LOCALE;
}

export function parseLocales(value) {
  const wanted = String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => LANGUAGES[s]);
  // Η προεπιλεγμένη γλώσσα είναι πάντα ανοιχτή και πρώτη.
  return [DEFAULT_LOCALE, ...wanted.filter((l) => l !== DEFAULT_LOCALE)].filter((l, i, a) => a.indexOf(l) === i);
}

export function enabledLocales() {
  return parseLocales(configured());
}

export function isEnabledLocale(code) {
  return enabledLocales().includes(code);
}

// Ποια γλώσσα ισχύει όταν φτάνει ένα αίτημα: πρώτα η επιλογή του χρήστη
// (cookie), μετά το domain, μετά η προεπιλογή.
export function resolveLocale({ cookie, hostname } = {}) {
  if (cookie && isEnabledLocale(cookie)) return cookie;
  const byHost = HOST_DEFAULTS[String(hostname || "").toLowerCase()];
  if (byHost && isEnabledLocale(byHost)) return byHost;
  return DEFAULT_LOCALE;
}

// Στον browser: η γλώσσα που δείχνει τώρα η σελίδα (ορίζεται από το
// PlatformShell στο <html lang>). Για κώδικα που δεν είναι React component,
// π.χ. μορφοποίηση ημερομηνιών.
export function activeLocale() {
  if (typeof document !== "undefined") {
    const l = document.documentElement.lang;
    if (LANGUAGES[l]) return l;
  }
  return DEFAULT_LOCALE;
}

export function intlLocale(code) {
  return (LANGUAGES[code] || LANGUAGES[DEFAULT_LOCALE]).intl;
}
