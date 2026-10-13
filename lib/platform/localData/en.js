// Αγγλικά ονόματα για τα δεδομένα που ζουν στη βάση ως ελληνικό κείμενο
// (docs/I18N.md §7). Κλειδί: το όνομα όπως είναι στη βάση. Ονόματα μερών,
// περιοχών και χωρών έρχονται από το lib/platform/places.js (πεδίο `en`)·
// ό,τι δεν είναι εδώ ούτε εκεί γράφεται με λατινικά (ΕΛΟΤ 743), ποτέ ελληνικά.
// Ο έλεγχος tests/unit/localData.test.mjs αρνείται να περάσει αν μια τιμή των
// λιστών της βάσης (γλώσσες, εθνικότητες, τύποι σκαφών) δεν έχει εδώ όνομα.
export const BOAT_TYPES = {
  "Ιστιοπλοϊκό": "Sailboat",
  "Καταμαράν": "Catamaran",
  "Μηχανοκίνητο": "Motor yacht",
  Gulet: "Gulet",
};

export const LANGUAGES = {
  "Ελληνικά": "Greek", "Αγγλικά": "English", "Γερμανικά": "German", "Γαλλικά": "French", "Ιταλικά": "Italian",
  "Ισπανικά": "Spanish", "Ολλανδικά": "Dutch", "Πορτογαλικά": "Portuguese", "Σουηδικά": "Swedish", "Νορβηγικά": "Norwegian",
  "Δανικά": "Danish", "Φινλανδικά": "Finnish", "Πολωνικά": "Polish", "Τσεχικά": "Czech", "Σλοβακικά": "Slovak",
  "Ουγγρικά": "Hungarian", "Ρουμανικά": "Romanian", "Βουλγαρικά": "Bulgarian", "Κροατικά": "Croatian", "Σλοβενικά": "Slovenian",
  "Σερβικά": "Serbian", "Ουκρανικά": "Ukrainian", "Ρωσικά": "Russian", "Τουρκικά": "Turkish", "Αραβικά": "Arabic",
  "Εβραϊκά": "Hebrew", "Κινεζικά": "Chinese", "Ιαπωνικά": "Japanese", "Κορεατικά": "Korean", "Ινδικά": "Indian languages",
};

export const NATIONALITIES = {
  "Ελληνική": "Greek", "Κυπριακή": "Cypriot", "Αλβανική": "Albanian", "Βουλγαρική": "Bulgarian", "Ρουμανική": "Romanian",
  "Σερβική": "Serbian", "Βορειομακεδονική": "North Macedonian", "Τουρκική": "Turkish", "Ιταλική": "Italian", "Γαλλική": "French",
  "Ισπανική": "Spanish", "Πορτογαλική": "Portuguese", "Γερμανική": "German", "Αυστριακή": "Austrian", "Ελβετική": "Swiss",
  "Ολλανδική": "Dutch", "Βελγική": "Belgian", "Βρετανική": "British", "Ιρλανδική": "Irish", "Σουηδική": "Swedish",
  "Νορβηγική": "Norwegian", "Δανική": "Danish", "Φινλανδική": "Finnish", "Πολωνική": "Polish", "Τσεχική": "Czech",
  "Σλοβακική": "Slovak", "Ουγγρική": "Hungarian", "Κροατική": "Croatian", "Σλοβενική": "Slovenian", "Ουκρανική": "Ukrainian",
  "Ρωσική": "Russian", "Αμερικανική": "American", "Καναδική": "Canadian", "Αυστραλιανή": "Australian", "Βραζιλιάνικη": "Brazilian",
  "Νοτιοαφρικανική": "South African", "Κινεζική": "Chinese", "Ιαπωνική": "Japanese", "Ινδική": "Indian", "Άλλη": "Other",
};

// Κείμενα που γράφει η ίδια η βάση (θέματα «Υγείας εφαρμογής», ετικέτες λογαριασμών,
// αιτίες που βάζουν οι συναρτήσεις). Τα ελεύθερα κείμενα των χρηστών δεν περνούν από εδώ.
export const SYSTEM_TEXT = {
  "Διαγραμμένος χρήστης": "Deleted user",
  "Η σελίδα έσπασε": "The page crashed",
  "Απρόβλεπτο σφάλμα": "Unexpected error",
  "Υπόλοιπο που δεν ταιριάζει με τις κινήσεις": "Balance does not match the transactions",
  "Αρνητικό υπόλοιπο": "Negative balance",
  "Πληρωμένο αίτημα που δεν έφτασε σε κανέναν επαγγελματία": "Paid request that reached no professional",
  "Αίτημα που έπρεπε να έχει λήξει και είναι ακόμα ανοιχτό": "Request that should have expired is still open",
  "Κράτηση που τελείωσε αλλά δεν έκλεισε": "Booking that ended but was not closed",
  "Ακύρωση επαγγελματία χωρίς αντικατάσταση ή πρόταση για πάνω από 24 ώρες": "Professional cancellation with no replacement or offer for over 24 hours",
  "Αντικαταστάσεις": "Replacements",
  "Αίτημα μεταφοράς που έπρεπε να έχει λήξει": "Delivery request that should have expired",
  "Αίτημα αγοράς credits σε αναμονή πάνω από 2 μέρες": "Credit purchase request pending for over 2 days",
  "Επαγγελματίας σε αναμονή έγκρισης πάνω από 3 μέρες": "Professional awaiting approval for over 3 days",
  "Λογαριασμός χωρίς επιβεβαίωση πάνω από 3 μέρες": "Account unverified for over 3 days",
  "Email ειδοποίησης που δεν στάλθηκε (7 ημέρες)": "Notification email not sent (7 days)",
  "Χρήστες πηγαινοέρχονται ανάμεσα σε δύο σελίδες": "Users going back and forth between two pages",
  "Χρήστες ξαναφορτώνουν τη σελίδα ξανά και ξανά": "Users reloading the page again and again",
  "Χρήστες κολλάνε: ίδια αποτυχία ξανά και ξανά": "Users stuck: the same failure again and again",
  "Αποτυχία ενέργειας στη βάση": "Database action failed",
  "Σφάλμα διακομιστή": "Server error",
  "Έφτασε η ημερομηνία του ταξιδιού χωρίς αντικαταστάτη": "Trip date reached with no replacement",
  "Ο λογαριασμός του επαγγελματία διαγράφηκε": "The professional's account was deleted",
  "Διαγραφή από admin": "Deleted by admin",
  "Κλείσιμο υπόθεσης αντικατάστασης χωρίς αντικαταστάτη": "Replacement case closed without a replacement",
  "Χωρίς αναφερόμενο λόγο": "No reason given",
};

// Αρχές κειμένων που ακολουθούνται από όνομα («Πολλοί σταματούν: Εγγραφή»).
export const SYSTEM_PREFIXES = {
  "Πολλοί σταματούν: ": "Many drop out: ",
};

// Ετικέτες ροών της «Υγείας εφαρμογής» (flow_steps, 0117).
export const FLOWS = {
  "Αποστολή αιτήματος": "Sending a request",
  "Αγορά credits": "Buying credits",
  "Εγγραφή": "Sign-up",
  "Δήλωση διαθεσιμότητας": "Setting availability",
  "Αίτημα μεταφοράς σκάφους": "Boat delivery request",
};
