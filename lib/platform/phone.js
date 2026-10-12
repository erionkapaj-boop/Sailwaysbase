import { isValidPhoneNumber, parsePhoneNumberFromString } from "libphonenumber-js/mobile";

// One normalisation for every place a phone number enters the system — the
// browser (db.js) and the service-role routes alike. Greek numbers without a
// prefix get +30; anything already starting with + (or the international 00)
// is taken as given.
//
// «0030 694…» και «00306940…» είναι το ίδιο με «+30694…»: το 00 είναι το
// διεθνές πρόθεμα, όχι μέρος του αριθμού. Παλιότερα γινόταν «+300306940…»,
// ένας αριθμός που δεν υπάρχει.
export function normalizePhone(raw) {
  let d = String(raw || "").replace(/[^\d+]/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (!d.startsWith("+")) {
    if (d.startsWith("30") && d.length >= 12) d = "+" + d;
    else d = "+30" + d.replace(/^0+/, "");
  }
  // «+30 0694…», «+30 30 694…», «+30 030 694…»: ελληνικός αριθμός δεν ξεκινά ποτέ με 0 ή με 30.
  d = d.replace(/^\+30(?:0*30|0+)(?=[26]\d{9}$)/, "+30");
  return d;
}

// Μόνο κινητό: ο αριθμός είναι αυτός με τον οποίο θα βρει ο ένας τον άλλον μετά την κράτηση,
// και ένας σταθερός δεν είναι ποτέ «ο αριθμός του». Ελλάδα: 10 ψηφία, ξεκινά από 69. Κάθε άλλη
// χώρα: έγκυρο κινητό με τους κανόνες της χώρας (μήκος, πρώτα ψηφία)· σταθερό απορρίπτεται.
export function isValidPhone(normalized) {
  const p = normalized || "";
  if (!/^\+\d{7,15}$/.test(p)) return false;
  if (p.startsWith("+30")) return /^\+3069\d{8}$/.test(p);
  return isValidPhoneNumber(p);
}

// Ο αριθμός όπως τον διαβάζει ο άνθρωπος: «+30 694 090 3478». Κενό αν δεν αναγνωρίζεται.
export function formatPhone(e164) {
  try {
    return parsePhoneNumberFromString(e164 || "")?.formatInternational() || "";
  } catch {
    return "";
  }
}
