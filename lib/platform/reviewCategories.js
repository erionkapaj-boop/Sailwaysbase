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

const BY_ROLE = {
  skipper: SKIPPER_CATEGORIES,
  hostess: HOSTESS_CATEGORIES,
};

// Kept for existing callers that haven't been made role-aware yet — same
// list as before (skipper's), never used for a hostess review or display.
export const REVIEW_CATEGORIES = SKIPPER_CATEGORIES;

export function reviewCategoriesForRole(crewRole) {
  return BY_ROLE[crewRole] || SKIPPER_CATEGORIES;
}
