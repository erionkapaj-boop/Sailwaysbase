// Unmapped errors used to reach the screen as-is — English/technical text
// ("Cannot read properties of null…", "request_not_open") in a Greek UI.
// Greek messages (ours) pass through; anything else becomes a plain
// sentence, with the original kept in the console for debugging.
const GENERIC = "Κάτι πήγε στραβά. Δοκίμασε ξανά σε λίγο και, αν συνεχίσει, επικοινώνησε μαζί μας.";

// Database errors that mean the same thing wherever they come from.
const KNOWN = {
  account_not_active: "Ο λογαριασμός σου δεν είναι ενεργός αυτή τη στιγμή. Για οποιαδήποτε απορία, επικοινώνησε μαζί μας.",
  test_account_mismatch: "Οι δοκιμαστικοί λογαριασμοί συνεργάζονται μόνο με δοκιμαστικούς λογαριασμούς.",
  test_phone_cannot_be_admin: "Ένας δοκιμαστικός λογαριασμός δεν μπορεί να γίνει διαχειριστής.",
};

export function friendlyError(err) {
  const msg = err?.message || String(err || "");
  if (/[Ͱ-Ͽ]/.test(msg)) return msg;
  if (KNOWN[msg]) return KNOWN[msg];
  console.error(err);
  return GENERIC;
}
