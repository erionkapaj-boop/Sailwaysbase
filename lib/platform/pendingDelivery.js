// Ίδιο σκεπτικό με το pendingBroadcast.js, για το αίτημα μεταφοράς σκάφους:
// η φόρμα (διαδρομή/μίλια/ημερομηνία) και η επιλογή skipper γίνονται χωρίς
// σύνδεση· μόνο η πραγματική αποστολή (που δημιουργεί το αίτημα στη βάση
// και χρεώνει το τέλος) απαιτεί λογαριασμό. Χωρίς αυτό, κάποιος που
// συμπλήρωσε όλη τη φόρμα και διάλεξε skipper θα έχανε τα πάντα στο login
// wall και θα έπρεπε να ξαναρχίσει από το μηδέν.
const KEY = "sf_pending_delivery";

// formValues: ό,τι συμπλήρωσε στη φόρμα (DeliveryForm). skipper: { price,
// selected } — η τιμή και οι επιλεγμένοι υποψήφιοι skipper τη στιγμή που
// χτύπησε το login wall.
export function savePendingDelivery({ formValues, skipper }) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ formValues, skipper }));
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
