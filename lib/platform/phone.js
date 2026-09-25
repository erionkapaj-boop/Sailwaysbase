// One normalisation for every place a phone number enters the system — the
// browser (db.js) and the service-role routes alike. Greek numbers without a
// prefix get +30; anything already starting with + is taken as given.
export function normalizePhone(raw) {
  const digits = (raw || "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return "+30" + digits.slice(1);
  if (digits.startsWith("30")) return "+" + digits;
  return "+30" + digits;
}

export function isValidPhone(normalized) {
  return /^\+\d{10,15}$/.test(normalized || "");
}
