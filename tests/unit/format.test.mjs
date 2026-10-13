// Ημερομηνίες ανά γλώσσα (lib/platform/format.js). Τρέχει με: node tests/unit/format.test.mjs
//
// 1. Τα ελληνικά βγαίνουν ΑΚΡΙΒΩΣ όπως έβγαιναν πριν από την υποδομή γλωσσών:
//    το παλιό κείμενο (από το commit πριν) είναι ο κανόνας, όχι η εικασία.
// 2. Τα αγγλικά και κάθε άλλη γλώσσα δίνουν πλήρη, αναγνωρίσιμη έξοδο.
import * as F from "../../lib/platform/format.js";
import { enabledLocales, parseLocales, resolveLocale, LANGUAGES } from "../../lib/platform/i18n.js";

let failures = 0;
function eq(label, got, want) {
  if (got === want) return console.log(`ok   ${label}`);
  failures += 1;
  console.log(`FAIL ${label}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`);
}

// --- Το παλιό κείμενο, αντιγραμμένο αυτούσιο (πριν το 0123) -----------------
const OLD_MONTH_SHORT = ["Ιαν", "Φεβ", "Μαρ", "Απρ", "Μαΐ", "Ιουν", "Ιουλ", "Αυγ", "Σεπ", "Οκτ", "Νοε", "Δεκ"];
function oldRange(startDate, endDate) {
  if (!startDate || !endDate) return "";
  const [y1, m1, d1] = startDate.split("-").map(Number);
  const [y2, m2, d2] = endDate.split("-").map(Number);
  if (y1 === y2 && m1 === m2) {
    return d1 === d2 ? `${d1} ${OLD_MONTH_SHORT[m1 - 1]} ${y1}` : `${d1}–${d2} ${OLD_MONTH_SHORT[m1 - 1]} ${y1}`;
  }
  if (y1 === y2) return `${d1} ${OLD_MONTH_SHORT[m1 - 1]} – ${d2} ${OLD_MONTH_SHORT[m2 - 1]} ${y2}`;
  return `${d1} ${OLD_MONTH_SHORT[m1 - 1]} ${y1} – ${d2} ${OLD_MONTH_SHORT[m2 - 1]} ${y2}`;
}
const oldDateSimple = (isoDate) => {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
};
const OLD_MONTH_GEN = ["Ιανουαρίου", "Φεβρουαρίου", "Μαρτίου", "Απριλίου", "Μαΐου", "Ιουνίου", "Ιουλίου", "Αυγούστου", "Σεπτεμβρίου", "Οκτωβρίου", "Νοεμβρίου", "Δεκεμβρίου"];
const OLD_WEEKDAY_SHORT = ["Κυρ", "Δευ", "Τρί", "Τετ", "Πέμ", "Παρ", "Σάβ"];
const oldParse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const oldShortDay = (key) => { if (!key) return ""; const d = oldParse(key); return `${OLD_WEEKDAY_SHORT[d.getDay()]} ${d.getDate()} ${OLD_MONTH_GEN[d.getMonth()].slice(0, 3)}`; };
const oldLongDay = (key) => { if (!key) return ""; const d = oldParse(key); return `${d.getDate()} ${OLD_MONTH_GEN[d.getMonth()]} ${d.getFullYear()}`; };
function oldTimeAgo(iso, now) {
  if (!iso) return "";
  const secs = Math.floor((now - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "μόλις τώρα";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `πριν ${mins} ${mins === 1 ? "λεπτό" : "λεπτά"}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `πριν ${hours} ${hours === 1 ? "ώρα" : "ώρες"}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `πριν ${days} ${days === 1 ? "ημέρα" : "ημέρες"}`;
  return oldDateSimple(new Date(iso).toISOString().slice(0, 10));
}

// --- Ελληνικά: ταύτιση με το παλιό, για κάθε ημέρα του 2026 και 2027 --------
let rangeChecked = 0, dateChecked = 0, dayChecked = 0;
for (let i = 0; i < 730; i += 1) {
  const a = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
  const b = new Date(Date.UTC(2026, 0, 1 + i + (i % 9))).toISOString().slice(0, 10);
  const c = new Date(Date.UTC(2026, 0, 1 + i + 20 + (i % 400))).toISOString().slice(0, 10);
  for (const [s, e] of [[a, a], [a, b], [a, c]]) {
    const got = F.formatDateRange(s, e, "el");
    if (got !== oldRange(s, e)) { failures += 1; console.log(`FAIL range ${s}..${e}: ${got} ≠ ${oldRange(s, e)}`); }
    rangeChecked += 1;
  }
  if (F.formatDate(a, "el") !== oldDateSimple(a)) { failures += 1; console.log(`FAIL date ${a}: ${F.formatDate(a, "el")} ≠ ${oldDateSimple(a)}`); }
  dateChecked += 1;
  if (F.shortDay(a, "el") !== oldShortDay(a) || F.longDay(a, "el") !== oldLongDay(a)) { failures += 1; console.log(`FAIL day ${a}: ${F.shortDay(a, "el")} / ${F.longDay(a, "el")}`); }
  dayChecked += 1;
}
eq(`ελληνικά: ${rangeChecked} εύρη ημερομηνιών ίδια με το παλιό`, true, true);
eq(`ελληνικά: ${dateChecked} ημερομηνίες ίδιες με το παλιό`, true, true);
eq(`ελληνικά: ${dayChecked} σύντομες και μεγάλες ημέρες ίδιες με το παλιό`, true, true);

const NOW = Date.parse("2026-10-13T12:00:00Z");
for (const [label, iso] of [
  ["30 δευτερόλεπτα", "2026-10-13T11:59:30Z"], ["1 λεπτό", "2026-10-13T11:59:00Z"], ["5 λεπτά", "2026-10-13T11:55:00Z"],
  ["1 ώρα", "2026-10-13T11:00:00Z"], ["5 ώρες", "2026-10-13T07:00:00Z"], ["1 ημέρα", "2026-10-12T11:00:00Z"],
  ["3 ημέρες", "2026-10-10T11:00:00Z"], ["6 ημέρες", "2026-10-07T11:00:00Z"], ["10 ημέρες", "2026-10-03T11:00:00Z"],
]) eq(`ελληνικά: timeAgo ${label}`, F.timeAgo(iso, "el", NOW), oldTimeAgo(iso, NOW));

// Ώρα: ίδια κλήση με πριν (el-GR), άρα ίδιο αποτέλεσμα στο ίδιο σύστημα.
const sample = "2026-10-13T07:15:00Z";
const d0 = new Date(sample);
eq("ελληνικά: ημερομηνία και ώρα όπως πριν", F.formatDateTime(sample, "el"),
  `${d0.toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit", year: "numeric" })}, ${d0.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}`);

// --- Αγγλικά ----------------------------------------------------------------
eq("αγγλικά: εύρος σε έναν μήνα", F.formatDateRange("2026-09-25", "2026-09-29", "en"), "25–29 Sep 2026");
eq("αγγλικά: εύρος σε δύο μήνες", F.formatDateRange("2026-09-28", "2026-10-03", "en"), "28 Sep – 3 Oct 2026");
eq("αγγλικά: εύρος σε δύο έτη", F.formatDateRange("2026-12-30", "2027-01-02", "en"), "30 Dec 2026 – 2 Jan 2027");
eq("αγγλικά: μία ημέρα", F.formatDateRange("2026-05-07", "2026-05-07", "en"), "7 May 2026");
eq("αγγλικά: ημερομηνία", F.formatDate("2026-09-25", "en"), "25/09/2026");
eq("αγγλικά: σύντομη ημέρα", F.shortDay("2026-09-24", "en"), "Thu 24 Sep");
eq("αγγλικά: μεγάλη ημέρα", F.longDay("2026-09-24", "en"), "24 September 2026");
eq("αγγλικά: μήνες (μεγάλοι)", F.monthNames("en", "long").join(","), "January,February,March,April,May,June,July,August,September,October,November,December");
eq("αγγλικά: ημέρες εβδομάδας (σύντομες, Κυριακή πρώτη)", F.weekdayNames("en", "short").join(","), "Sun,Mon,Tue,Wed,Thu,Fri,Sat");
eq("αγγλικά: ημέρες εβδομάδας (κεφαλίδες, Δευτέρα πρώτη)", F.weekdayNames("en", "mini").join(","), "Mo,Tu,We,Th,Fr,Sa,Su");
eq("αγγλικά: timeAgo λεπτά", F.timeAgo("2026-10-13T11:55:00Z", "en", NOW), "5 minutes ago");
eq("αγγλικά: timeAgo ώρες", F.timeAgo("2026-10-13T07:00:00Z", "en", NOW), "5 hours ago");
eq("αγγλικά: timeAgo ημέρα", F.timeAgo("2026-10-12T11:00:00Z", "en", NOW), "yesterday");
eq("αγγλικά: timeAgo μετά από 7 ημέρες = ημερομηνία", F.timeAgo("2026-10-03T11:00:00Z", "en", NOW), "03/10/2026");
eq("αγγλικά: κανένα ελληνικό γράμμα σε καμία έξοδο",
  /[Ͱ-Ͽἀ-῿]/.test([
    F.formatDateRange("2026-09-25", "2026-10-03", "en"), F.shortDay("2026-09-24", "en"), F.longDay("2026-09-24", "en"),
    F.timeAgo("2026-10-12T11:00:00Z", "en", NOW), F.formatDateTime(sample, "en"), ...F.monthNames("en", "genitive"), ...F.weekdayNames("en", "mini"),
  ].join(" ")), false);

// --- Γλώσσα που δεν έχουμε γράψει καθόλου: το Intl αρκεί -------------------
LANGUAGES.de = { code: "de", name: "Deutsch", short: "DE", intl: "de-DE", flag: "de" };
eq("τρίτη γλώσσα (de) χωρίς καμία γραμμή: μήνες", F.monthNames("de", "long")[2], "März");
eq("τρίτη γλώσσα (de): εύρος", /^25–29 \S+ 2026$/.test(F.formatDateRange("2026-09-25", "2026-09-29", "de")), true);
delete LANGUAGES.de;

// --- Μητρώο γλωσσών ---------------------------------------------------------
eq("μητρώο: ελληνικά πρώτα και πάντα ανοιχτά", parseLocales("en").join(","), "el,en");
eq("μητρώο: άγνωστη γλώσσα αγνοείται", parseLocales("xx,en,el").join(","), "el,en");
eq("μητρώο: κενό = μόνο ελληνικά", parseLocales("").join(","), "el");
eq("μητρώο: χωρίς ρύθμιση είναι ανοιχτά μόνο τα ελληνικά", enabledLocales().join(","), "el");
eq("μητρώο: cookie ανοιχτής γλώσσας ισχύει", resolveLocale({ cookie: "el", hostname: "x.gr" }), "el");
eq("μητρώο: κλειστή γλώσσα στο cookie αγνοείται", resolveLocale({ cookie: "en", hostname: "skipperfinder.gr" }), "el");
eq("μητρώο: το domain δεν ανοίγει κλειστή γλώσσα", resolveLocale({ cookie: undefined, hostname: "skipperfinder.com" }), "el");

console.log(failures ? `\n${failures} FAILED` : "\nALL FORMAT TESTS PASSED");
process.exit(failures ? 1 : 0);
