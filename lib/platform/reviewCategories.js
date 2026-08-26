// The six axes a client rates a professional on, in one shared place so the
// review form (collecting them) and every display of them (search results,
// the booking panel) can never drift apart or list them in a different order.
//
// Keys stay English (mirrored 1:1 into DB column suffixes rating_<key> /
// rating_avg_<key>) — only the labels/hints are Greek, same convention as
// CREW_ROLES in roles.js.
export const REVIEW_CATEGORIES = [
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
