// Ίδιο σκεπτικό με το pendingBroadcast.js, για το αίτημα μεταφοράς σκάφους:
// η επιλογή πληρώματος, η φόρμα (διαδρομή/μίλια/ημερομηνία) και η επιλογή
// υποψηφίων γίνονται χωρίς σύνδεση· μόνο η πραγματική αποστολή (που
// δημιουργεί το αίτημα στη βάση και χρεώνει το τέλος) απαιτεί λογαριασμό.
// Χωρίς αυτό, κάποιος που συμπλήρωσε όλη τη φόρμα και διάλεξε πλήρωμα θα
// έχανε τα πάντα στο login wall και θα έπρεπε να ξαναρχίσει από το μηδέν.
const KEY = "sf_pending_delivery";

// formValues: ό,τι συμπλήρωσε στη φόρμα (DeliveryForm). pickedRoles: ποιοι
// ρόλοι επιλέχθηκαν στο πρώτο βήμα (RolePickerStep), εκτός skipper.
// pendingBlock: { role, price, selected } — το συγκεκριμένο μπλοκ που ήταν
// σε εξέλιξη τη στιγμή που χτύπησε το login wall (όποιου ρόλου, όχι πάντα
// skipper — όλα τα μπλοκ είναι ορατά μαζί από την αρχή).
export function savePendingDelivery(data) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Private-browsing ή απενεργοποιημένο storage: το redirect γίνεται
    // ούτως ή άλλως, απλά θα ξαναφτιάξει τη φόρμα. Δεν αξίζει να μπλοκάρει
    // το login γι' αυτό.
  }
}

// Single-use: διαβάζεται μία φορά στο πρώτο mount μετά την επιστροφή, μετά
// σβήνεται — ώστε μια απλή, μεταγενέστερη επίσκεψη να μην ξαναδείχνει παλιά
// δεδομένα.
export function takePendingDelivery() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function hasPendingDelivery() {
  try {
    return Boolean(sessionStorage.getItem(KEY));
  } catch {
    return false;
  }
}
