// Διεκδίκηση που ξεκίνησε χωρίς λογαριασμό, ή χωρίς αρκετά credits, ή πριν την
// έγκριση του επαγγελματία. Μένει στη συσκευή μέχρι να ολοκληρωθεί: εγγραφή,
// έγκριση, και τελευταία η αγορά credits. Ένα αίτημα τη φορά, χρήσιμο μόνο
// όσο το αίτημα είναι ανοιχτό (η βάση το κρίνει).
const KEY = "sf_pending_claim";

export function savePendingClaim(requestId) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ requestId, at: Date.now() }));
  } catch {}
}
export function getPendingClaim() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!v?.requestId || Date.now() - v.at > 14 * 864e5) return null;
    return v.requestId;
  } catch {
    return null;
  }
}
export function clearPendingClaim() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
