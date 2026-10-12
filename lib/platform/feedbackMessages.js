// Τι λέει η εφαρμογή όταν πετύχει μια αλλαγή (FeedbackProvider). Κλειδί: το όνομα της
// ενέργειας στη βάση (rpc) ή «πίνακας:ΜΕΘΟΔΟΣ» για απευθείας εγγραφή. Κείμενο: σύντομο,
// παρελθόντας χρόνος, μόνο το γεγονός.
//
// Δεν μπαίνουν εδώ:
//  - ενέργειες που ήδη καταλήγουν σε δική τους οθόνη επιτυχίας (αποστολή αιτήματος,
//    εγγραφή, φόρμα επικοινωνίας) ή δικό τους μήνυμα (ακύρωση αιτήματος με επιστροφή credit)·
//  - ό,τι τρέχει στο παρασκήνιο (διαβασμένα, παρακολούθηση, τελευταία είσοδος)·
//  - μηνύματα συνομιλίας, που εμφανίζονται ήδη μόνα τους στη λίστα.
export const WRITE_MESSAGES = {
  // Προφίλ και λογαριασμός
  "users:PATCH": "Αποθηκεύτηκε",
  "client_profiles:PATCH": "Το προφίλ αποθηκεύτηκε",
  "skipper_profiles:PATCH": "Το προφίλ αποθηκεύτηκε",
  "skipper_secondary_roles:PATCH": "Η ιδιότητα αποθηκεύτηκε",
  "skipper_secondary_roles:POST": "Η ιδιότητα προστέθηκε",
  "skipper_secondary_roles:DELETE": "Η ιδιότητα αφαιρέθηκε",
  become_professional: "Η αίτηση επαγγελματία στάλθηκε",

  // Διαθεσιμότητα
  set_availability_period: "Η διαθεσιμότητα αποθηκεύτηκε",
  "availability_windows:DELETE": "Η περίοδος αφαιρέθηκε",
  "availability_blocks:POST": "Η απουσία καταχωρήθηκε",
  "availability_blocks:DELETE": "Η απουσία αφαιρέθηκε",
  "delivery_availability_windows:POST": "Η διαθεσιμότητα αποθηκεύτηκε",
  "delivery_availability_windows:DELETE": "Η περίοδος αφαιρέθηκε",

  // Αιτήματα και κρατήσεις
  claim_booking_request: "Το αίτημα έγινε αποδεκτό",
  decline_booking_request: "Το αίτημα απορρίφθηκε",
  client_withdraw_ping: "Το αίτημα αποσύρθηκε",
  cancel_booking: "Η κράτηση ακυρώθηκε",
  cancel_booking_no_response: "Η κράτηση ακυρώθηκε",
  cancel_delivery_booking: "Η κράτηση ακυρώθηκε",
  accept_delivery_role_request: "Το αίτημα έγινε αποδεκτό",
  decline_delivery_role_request: "Το αίτημα απορρίφθηκε",
  cancel_delivery_role_request: "Το αίτημα ακυρώθηκε",
  relist_delivery_role_request: "Το αίτημα επαναδημοσιεύτηκε",
  client_select_replacement_candidate: "Ο επαγγελματίας επιλέχθηκε",
  respond_to_replacement_offer: "Η απάντηση καταχωρήθηκε",
  withdraw_replacement_candidacy: "Η υποψηφιότητα αποσύρθηκε",

  // Αξιολογήσεις
  "reviews:POST": "Η αξιολόγηση καταχωρήθηκε",
  "reviews:PATCH": "Η αξιολόγηση ενημερώθηκε",

  // Credits
  request_credit_purchase: "Το αίτημα αγοράς στάλθηκε",
  cancel_credit_purchase_request: "Το αίτημα αγοράς ακυρώθηκε",

  // Διαχείριση
  admin_verify_user: "Ο λογαριασμός επαληθεύτηκε",
  admin_approve_skipper: "Το προφίλ εγκρίθηκε",
  admin_reject_skipper: "Το προφίλ απορρίφθηκε",
  admin_approve_secondary_role: "Η ιδιότητα εγκρίθηκε",
  admin_reject_secondary_role: "Η ιδιότητα απορρίφθηκε",
  admin_approve_photo: "Η φωτογραφία εγκρίθηκε",
  admin_clear_photo: "Η φωτογραφία αφαιρέθηκε",
  admin_soft_delete_skipper: "Το προφίλ αφαιρέθηκε",
  admin_suspend_account: "Ο λογαριασμός ανεστάλη",
  admin_reactivate_account: "Ο λογαριασμός ενεργοποιήθηκε",
  admin_delete_account: "Ο λογαριασμός διαγράφηκε",
  admin_restore_account: "Ο λογαριασμός επαναφέρθηκε",
  admin_set_staff_admin: "Τα δικαιώματα άλλαξαν",
  admin_set_test_account: "Η σήμανση δοκιμαστικού άλλαξε",
  admin_update_profile: "Αποθηκεύτηκε",
  admin_update_setting: "Η ρύθμιση αποθηκεύτηκε",
  admin_create_offer: "Η προσφορά στάλθηκε",
  admin_cancel_offer: "Η προσφορά ακυρώθηκε",
  admin_close_replacement_case: "Η υπόθεση έκλεισε",
  admin_resolve_report: "Η αναφορά έκλεισε",
  admin_resolve_flag: "Το θέμα έκλεισε",
  admin_resolve_health_issue: "Το θέμα έκλεισε",
  admin_set_contact_message_status: "Η κατάσταση άλλαξε",
  admin_run_health_checks: "Ο έλεγχος ολοκληρώθηκε",
  admin_record_purchase: "Η αγορά καταχωρήθηκε",
  admin_complete_credit_purchase: "Η πληρωμή επιβεβαιώθηκε",
  admin_cancel_credit_purchase: "Το αίτημα αγοράς ακυρώθηκε",
  admin_credit_wallet: "Τα credits προστέθηκαν",
  admin_adjust_wallet: "Το υπόλοιπο διορθώθηκε",
};

export const FAILURE_MESSAGE = "Δεν ολοκληρώθηκε. Δοκίμασε ξανά.";
