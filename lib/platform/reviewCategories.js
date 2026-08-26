// The six axes a client rates a professional on, one set per crew role, in
// one shared place so the review form (collecting them) and every display of
// them (search results, the booking panel) can never drift apart or list
// them in a different order.
//
// Keys stay English (mirrored 1:1 into DB column suffixes rating_<key> /
// rating_avg_<key>) — only the labels/hints are Greek, same convention as
// CREW_ROLES in roles.js. Four keys (cleanliness, professionalism,
// communication, hospitality) are shared columns across roles — same
// underlying rating_<key> field — but each role gets its own label/hint,
// since "Επαγγελματισμός" means something slightly different for someone
// who drives the boat versus someone who works the cabins.
const SKIPPER_CATEGORIES = [
  {
    key: "safety",
    label: "Ασφάλεια",
    hint: "Χειρισμός σκάφους, αποφάσεις, πρόληψη κινδύνων, τήρηση κανόνων",
  },
  {
    key: "seamanship",
    label: "Ναυτοσύνη",
    hint: "Γνώσεις, πλοήγηση, χειρισμοί, αγκυροβολία, αντιμετώπιση καταστάσεων",
  },
  {
    key: "professionalism",
    label: "Επαγγελματισμός",
    hint: "Συνέπεια, υπευθυνότητα, τήρηση συμφωνιών και σωστή συμπεριφορά",
  },
  {
    key: "cleanliness",
    label: "Καθαριότητα & Τάξη",
    hint: "Κατάσταση και οργάνωση σκάφους κατά τη διάρκεια του charter",
  },
  {
    key: "communication",
    label: "Επικοινωνία",
    hint: "Ενημέρωση πελατών, σαφήνεια, συνεργασία και ανταπόκριση",
  },
  {
    key: "hospitality",
    label: "Εμπειρία & Φιλοξενία",
    hint: "Γνώση προορισμών, προτάσεις, εξυπηρέτηση και συνολική εμπειρία των επισκεπτών",
  },
];

const HOSTESS_CATEGORIES = [
  {
    key: "cleanliness",
    label: "Καθαριότητα & Τάξη",
    hint: "Κοινόχρηστοι χώροι, κουζίνα και γενική εικόνα του σκάφους",
  },
  {
    key: "cooking",
    label: "Μαγειρική & Διατροφή",
    hint: "Ποιότητα φαγητού, γεύσεις, παρουσίαση και προσαρμογή στις προτιμήσεις των πελατών",
  },
  {
    key: "service",
    label: "Εξυπηρέτηση",
    hint: "Προθυμία, ταχύτητα και ποιότητα εξυπηρέτησης",
  },
  {
    key: "professionalism",
    label: "Επαγγελματισμός",
    hint: "Συνέπεια, υπευθυνότητα, διακριτικότητα και σωστή συμπεριφορά",
  },
  {
    key: "communication",
    label: "Επικοινωνία",
    hint: "Ευγένεια, συνεργασία και σαφής επικοινωνία με τους επισκέπτες και το πλήρωμα",
  },
  {
    key: "hospitality",
    label: "Φιλοξενία",
    hint: "Δημιουργία ευχάριστης ατμόσφαιρας και συνολική εμπειρία των επισκεπτών",
  },
];

// The reverse direction: what a professional (skipper or hostess — the set
// is the same regardless of which) rates a client on. Same mechanism, own
// columns entirely (rating_boat_respect etc.) — none of these overlap in
// meaning with any professional-side category, so none of them share a
// column the way hostess borrows four of skipper's.
const CLIENT_CATEGORIES = [
  {
    key: "boat_respect",
    label: "Σεβασμός στο Σκάφος",
    hint: "Προσοχή στον εξοπλισμό, στους χώρους και στη γενική κατάσταση του σκάφους",
  },
  {
    key: "responsibility",
    label: "Υπευθυνότητα",
    hint: "Τήρηση οδηγιών, κανόνων ασφαλείας και σωστή χρήση του σκάφους",
  },
  {
    key: "cooperation",
    label: "Συνεργασία",
    hint: "Συνεργασία με skipper και πλήρωμα, ειδικά όταν χρειάζονται οδηγίες ή αλλαγές",
  },
  {
    key: "consistency",
    label: "Συνέπεια",
    hint: "Τήρηση συμφωνημένων ωραρίων, διαδικασιών και υποχρεώσεων και οικονομικών υποχρεώσεων",
  },
  {
    key: "conduct",
    label: "Συμπεριφορά",
    hint: "Ευγένεια, σεβασμός και επαγγελματική συμπεριφορά απέναντι στο πλήρωμα",
  },
  {
    key: "tidiness",
    label: "Καθαριότητα & Τάξη",
    hint: "Διατήρηση των χώρων σε λογική κατάσταση και σεβασμός στους κοινόχρηστους χώρους",
  },
];

// Almost entirely its own axes — a cook mostly works out of sight in the
// galley, so the guest-facing categories skipper/hostess share
// (professionalism, communication, hospitality) don't apply the same way.
// Only "cleanliness" is shared (kitchen hygiene is the same underlying
// column as boat/common-area tidiness); the other five are food/kitchen
// specific and don't correspond to anything skipper or hostess already have.
const COOK_CATEGORIES = [
  {
    key: "taste",
    label: "Γεύση",
    hint: "Ποιότητα και γεύση των πιάτων",
  },
  {
    key: "variety",
    label: "Ποικιλία",
    hint: "Εναλλαγή γευμάτων και προσαρμογή στο πρόγραμμα",
  },
  {
    key: "presentation",
    label: "Παρουσίαση",
    hint: "Εμφάνιση, σερβίρισμα και αισθητική των πιάτων",
  },
  {
    key: "adaptability",
    label: "Προσαρμοστικότητα",
    hint: "Ανταπόκριση σε προτιμήσεις, αλλεργίες και διατροφικές απαιτήσεις",
  },
  {
    key: "organization",
    label: "Οργάνωση",
    hint: "Προετοιμασία, διαχείριση προμηθειών και σωστή λειτουργία της κουζίνας",
  },
  {
    key: "cleanliness",
    label: "Καθαριότητα & Υγιεινή",
    hint: "Καθαρή κουζίνα, ασφαλής διαχείριση τροφίμων και τάξη",
  },
];

// Three of six reuse a skipper column outright (same label, same general
// idea applied to deck work instead of command): seamanship, safety,
// cleanliness. The other three are new — "teamwork" here means cooperating
// with the skipper/crew, a different thing from the client's own
// "cooperation" column (how cooperative the client was), so it stays its
// own column rather than reusing that one.
const DECKHAND_CATEGORIES = [
  {
    key: "seamanship",
    label: "Ναυτοσύνη",
    hint: "Γνώσεις και ικανότητα στις εργασίες καταστρώματος και στους χειρισμούς",
  },
  {
    key: "safety",
    label: "Ασφάλεια",
    hint: "Σωστή και ασφαλής εκτέλεση εργασιών και τήρηση οδηγιών",
  },
  {
    key: "maintenance",
    label: "Συντήρηση",
    hint: "Φροντίδα εξοπλισμού, καταστρώματος και βασικές εργασίες συντήρησης",
  },
  {
    key: "cleanliness",
    label: "Καθαριότητα & Τάξη",
    hint: "Κατάσταση καταστρώματος, εξοπλισμού και κοινόχρηστων χώρων",
  },
  {
    key: "teamwork",
    label: "Συνεργασία",
    hint: "Ομαδικότητα και αποτελεσματική συνεργασία με skipper και πλήρωμα",
  },
  {
    key: "diligence",
    label: "Εργατικότητα",
    hint: "Προθυμία, συνέπεια και διάθεση να αναλαμβάνει και να ολοκληρώνει εργασίες",
  },
];

const BY_ROLE = {
  skipper: SKIPPER_CATEGORIES,
  hostess: HOSTESS_CATEGORIES,
  cook: COOK_CATEGORIES,
  deckhand: DECKHAND_CATEGORIES,
  client: CLIENT_CATEGORIES,
};

// Kept for existing callers that haven't been made role-aware yet — same
// list as before (skipper's), never used for a hostess review or display.
export const REVIEW_CATEGORIES = SKIPPER_CATEGORIES;

export function reviewCategoriesForRole(crewRole) {
  return BY_ROLE[crewRole] || SKIPPER_CATEGORIES;
}
