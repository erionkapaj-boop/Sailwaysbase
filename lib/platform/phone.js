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

// Γενικά 10–15 ψηφία· για Ελλάδα ακριβώς 10 ψηφία μετά το +30, κινητό (69…)
// ή σταθερό (2…).
export function isValidPhone(normalized) {
  const p = normalized || "";
  if (!/^\+\d{10,15}$/.test(p)) return false;
  if (p.startsWith("+30")) return /^\+30(69\d{8}|2\d{9})$/.test(p);
  return true;
}
