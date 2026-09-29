// Unmapped errors used to reach the screen as-is — English/technical text
// ("Cannot read properties of null…", "request_not_open") in a Greek UI.
// Greek messages (ours) pass through; anything else becomes a plain
// sentence, with the original kept in the console for debugging.
const GENERIC = "Η ενέργεια δεν ολοκληρώθηκε. Δοκίμασε ξανά.";

// Database errors that mean the same thing wherever they come from.
const KNOWN = {
  account_not_active: "Ο λογαριασμός σου δεν είναι ενεργός αυτή τη στιγμή. Για οποιαδήποτε απορία, επικοινώνησε μαζί μας.",
  test_account_mismatch: "Οι δοκιμαστικοί λογαριασμοί συνεργάζονται μόνο με δοκιμαστικούς λογαριασμούς.",
  test_phone_cannot_be_admin: "Ένας δοκιμαστικός λογαριασμός δεν μπορεί να γίνει διαχειριστής.",

  // Δεν βρέθηκε / δεν επιτρέπεται
  booking_not_found: "Η κράτηση δεν βρέθηκε. Ανανέωσε τη σελίδα.",
  request_not_found: "Το αίτημα δεν βρέθηκε. Ανανέωσε τη σελίδα.",
  delivery_request_not_found: "Το αίτημα μεταφοράς δεν βρέθηκε. Ανανέωσε τη σελίδα.",
  role_request_not_found: "Το αίτημα δεν βρέθηκε. Ανανέωσε τη σελίδα.",
  ping_not_found: "Αυτός ο επαγγελματίας δεν είναι πια στο αίτημα. Ανανέωσε τη σελίδα.",
  ping_not_open: "Αυτή η πρόταση έχει ήδη απαντηθεί.",
  not_allowed: "Δεν έχεις δικαίωμα για αυτή την ενέργεια.",
  not_participant: "Δεν συμμετέχεις σε αυτή την κράτηση.",
  not_client_request: "Αυτό το αίτημα το διαχειρίζεται η πλατφόρμα, όχι ο πελάτης.",
  not_revealed: "Τα στοιχεία επικοινωνίας φαίνονται μόλις επιβεβαιωθεί η κράτηση.",
  not_cancellable: "Αυτή η κράτηση δεν μπορεί πια να ακυρωθεί.",
  use_replacement_flow: "Αυτή είναι πρόταση αντικατάστασης: απάντησε από την κάρτα της πρότασης.",
  bad_source: "Ανανέωσε τη σελίδα και δοκίμασε ξανά.",
  fee_not_paid: "Τα credits του αιτήματος δεν έχουν χρησιμοποιηθεί ακόμα.",
  delivery_rate_not_configured: "Οι τιμές μεταφοράς για αυτόν τον ρόλο δεν έχουν οριστεί ακόμα. Επικοινώνησε μαζί μας.",
  invalid_food_allowance: "Το ποσό για το φαγητό δεν είναι έγκυρο.",
  invalid_photo_url: "Η φωτογραφία δεν ανέβηκε σωστά. Δοκίμασε ξανά.",

  // Αξιολογήσεις και μηνύματα
  review_not_allowed_before_end_date: "Η αξιολόγηση ανοίγει μετά το τέλος του ταξιδιού.",
  review_not_allowed_cancelled: "Ακυρωμένη κράτηση δεν αξιολογείται.",
  reviewer_not_participant: "Μόνο όσοι συμμετείχαν στην κράτηση μπορούν να αξιολογήσουν.",
  reviewee_not_participant: "Αυτό το άτομο δεν συμμετείχε στην κράτηση.",
  comment_too_long: "Το σχόλιο είναι πολύ μεγάλο (έως 2.000 χαρακτήρες).",
  message_empty: "Γράψε κάτι πριν το στείλεις.",
  message_too_long: "Το μήνυμα είναι πολύ μεγάλο (έως 4.000 χαρακτήρες).",

  // Αιτήματα
  start_in_past: "Η ημερομηνία έναρξης έχει ήδη περάσει.",
  trip_too_long: "Ένα αίτημα καλύπτει έως 60 ημέρες. Για μεγαλύτερο διάστημα, κάνε δεύτερο αίτημα.",
  party_too_large: "Έως 50 άτομα ανά αίτημα.",
  too_many_professionals: "Ένα αίτημα πηγαίνει σε έως 30 επαγγελματίες.",
  skipper_not_available: "Κάποιος από όσους διάλεξες δεν είναι πια διαθέσιμος αυτές τις μέρες. Κάνε ξανά αναζήτηση.",
  request_expired: "Το αίτημα έχει λήξει.",
  trip_started: "Το ταξίδι έχει ξεκινήσει. Η κράτηση δεν ακυρώνεται πια.",
  professional_responded: "Ο επαγγελματίας έχει απαντήσει στα μηνύματα. Για ακύρωση χρησιμοποίησε την κανονική ακύρωση.",
  response_time_not_over: "Η προθεσμία απάντησης του επαγγελματία δεν έχει λήξει ακόμα.",
  departure_in_past: "Η ημερομηνία αναχώρησης έχει ήδη περάσει.",
  invalid_flexible_days: "Η ευελιξία φτάνει έως 30 ημέρες.",
  invalid_distance: "Η απόσταση δεν φαίνεται σωστή.",

  // Λογαριασμός
  invalid_email: "Το email δεν φαίνεται σωστό.",
  invalid_name: "Το ονοματεπώνυμο δεν φαίνεται σωστό.",
  pin_too_short: "Ο κωδικός θέλει τουλάχιστον 6 χαρακτήρες.",
  pin_too_weak: "Διάλεξε κάτι λιγότερο προφανές: όχι ίδια ψηφία (000000) ή σειρά (123456).",
  price_too_high: "Η τιμή ανά ημέρα φτάνει έως 5.000€.",
  invalid_years_experience: "Τα χρόνια εμπειρίας δεν φαίνονται σωστά.",
  invalid_date_of_birth: "Η ημερομηνία γέννησης δεν φαίνεται σωστή (πρέπει να είσαι τουλάχιστον 18).",
  too_many_messages: "Έστειλες ήδη αρκετά μηνύματα. Δοκίμασε ξανά σε μία ώρα.",

  // Διαχείριση
  cannot_edit_admin: "Αυτόν τον λογαριασμό τον διαχειρίζεται μόνο ο ιδιοκτήτης της πλατφόρμας.",
  cannot_reset_admin: "Αυτόν τον λογαριασμό τον διαχειρίζεται μόνο ο ιδιοκτήτης της πλατφόρμας.",
  owner_only: "Μόνο ο ιδιοκτήτης της πλατφόρμας μπορεί να το κάνει αυτό.",
  invalid_dates: "Η ημερομηνία λήξης είναι πριν την έναρξη.",
  date_in_past: "Η περίοδος δεν μπορεί να ξεκινά στο παρελθόν.",
  period_too_long: "Μια περίοδος φτάνει έως έναν χρόνο.",
  region_required: "Διάλεξε τουλάχιστον μία περιοχή.",
  window_not_found: "Η περίοδος δεν υπάρχει πια.",
  purchase_request_pending: "Έχεις ήδη ανοιχτό αίτημα αγοράς.",
  invalid_package: "Το πακέτο δεν είναι διαθέσιμο.",
  request_not_pending: "Το αίτημα έχει ήδη διεκπεραιωθεί.",
  request_not_found: "Το αίτημα δεν βρέθηκε.",
  cannot_credit_self: "Δεν μπορείς να αλλάξεις τα δικά σου credits.",
  invalid_value: "Η τιμή είναι εκτός επιτρεπτών ορίων για αυτή τη ρύθμιση.",
  cannot_hire_self: "Δεν μπορείς να προτείνεις τον εαυτό σου.",

  // Όρια (0115)
  too_many_requests: "Έφτασες το όριο αιτημάτων για σήμερα.",
  too_many_periods: "Έφτασες το όριο περιόδων. Σβήσε όσες δεν χρειάζεσαι.",
};

export function friendlyError(err) {
  const msg = err?.message || String(err || "");
  if (/[Ͱ-Ͽ]/.test(msg)) return msg;
  if (KNOWN[msg]) return KNOWN[msg];
  if (/violates check constraint "\w+_len"/.test(msg)) return "Το κείμενο είναι πολύ μεγάλο.";
  console.error(err);
  return GENERIC;
}
