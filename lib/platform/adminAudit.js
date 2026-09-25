import { labelForRole } from "./roles";
import { formatDate, formatDateRange, formatMoney, TOPIC_LABEL } from "./notifications";

// Ετικέτες για το ενιαίο ιστορικό λογαριασμού (admin_account_detail's
// `timeline`, 0091) — ίδιο μοτίβο με describeNotification: η συνάρτηση
// φέρνει (kind, data) ακατέργαστο, το κείμενο ζει εδώ.

const WALLET_TXN_LABEL = {
  deposit: "Κατάθεση",
  request_fee: "Τέλος αιτήματος",
  claim_fee: "Τέλος αποδοχής",
  refund_credit: "Επιστροφή",
};

// admin_actions.action_type: πριν το 0091 ήταν enum με μόλις 6 τιμές, οπότε
// κάθε νέο είδος ενέργειας από το 0065 και μετά ξαναχρησιμοποιούσε μία από
// αυτές (συνήθως 'ban_account') με το πραγματικό νόημα μόνο στο notes —
// εξ ου και ο διαχωρισμός με βάση το πρόθεμα του notes παρακάτω για τις
// παλιές γραμμές. Οι καινούργιες τιμές (verify_user, edit_profile, ...)
// γράφονται πλέον καθαρές.
const ACTION_LABEL = {
  approve_skipper: "Έγκριση επαγγελματία",
  reject_skipper: "Απόρριψη επαγγελματία",
  resolve_dispute: "Έκλεισε αναφορά ακύρωσης",
  edit_booking: "Αλλαγή σε κράτηση",
  confirm_wallet_topup: "Πίστωση πορτοφολιού",
  credit_wallet: "Πίστωση πορτοφολιού",
  verify_user: "Επαλήθευση λογαριασμού",
  reset_pin: "Νέος προσωρινός κωδικός",
  impersonate_start: "Σύνδεση ως ο χρήστης",
  impersonate_end: "Επιστροφή από «Σύνδεση ως»",
  edit_profile: "Διόρθωση στοιχείων",
  edit_contact: "Διόρθωση τηλεφώνου",
  clear_photo: "Αφαίρεση φωτογραφίας",
  approve_photo: "Φωτογραφία εγκρίθηκε",
  resolve_flag: "Σημαία εξετάστηκε",
  staff_admin_grant: "Δόθηκαν δικαιώματα διαχειριστή",
  staff_admin_revoke: "Αφαιρέθηκαν δικαιώματα διαχειριστή",
  test_account_on: "Σημειώθηκε ως λογαριασμός δοκιμών",
  test_account_off: "Αφαιρέθηκε η σήμανση δοκιμών",
};

// 'ban_account' (η παλιά, ξαναχρησιμοποιημένη τιμή) καλύπτει αναστολή,
// επαναφορά από αναστολή, διαγραφή και επαναφορά από διαγραφή — μόνο το
// πρόθεμα του notes λέει ποιο από τα τέσσερα ήταν.
function banAccountLabel(notes) {
  if (notes?.startsWith("Αναστολή:")) return "Αναστολή λογαριασμού";
  if (notes?.startsWith("Επαναφορά από αναστολή")) return "Επαναφορά από αναστολή";
  if (notes?.startsWith("Επαναφορά διαγραμμένου")) return "Επαναφορά λογαριασμού";
  if (notes?.startsWith("Διαγραφή")) return "Διαγραφή λογαριασμού";
  return "Αλλαγή κατάστασης λογαριασμού";
}

function place(d) {
  return [d.place, d.start_date && d.end_date ? formatDateRange(d.start_date, d.end_date) : formatDate(d.start_date)]
    .filter(Boolean)
    .join(" · ");
}
function route(d) {
  return d.origin_point && d.destination_point ? `${d.origin_point} → ${d.destination_point}` : "";
}

export function describeAuditEvent(e) {
  const d = e.data || {};
  switch (e.kind) {
    case "account_created":
      return { title: "Δημιουργία λογαριασμού", body: d.role === "skipper" ? "ως επαγγελματίας" : "ως πελάτης", tone: "neutral" };
    case "login_success":
      return { title: "Σύνδεση", body: "", tone: "neutral" };
    case "login_failed":
      return { title: "Αποτυχημένη προσπάθεια σύνδεσης", body: "λάθος κωδικός", tone: "warn" };
    case "request_sent":
      return { title: `Αίτημα για ${labelForRole(d.role)}`, body: place(d), tone: "neutral" };
    case "booking_confirmed":
      return {
        title: d.side === "client" ? "Κράτηση επιβεβαιώθηκε" : "Ανέλαβε κράτηση",
        body: [place(d), d.counterpart && (d.side === "client" ? `με ${d.counterpart}` : `για ${d.counterpart}`)]
          .filter(Boolean)
          .join(" · "),
        tone: "success",
      };
    case "booking_cancelled": {
      // Ποιος ακύρωσε το λέει το status, όχι η πλευρά: ο πελάτης μιας
      // κράτησης που ακύρωσε ο επαγγελματίας δεν «ακύρωσε κράτηση».
      const self =
        (d.side === "client" && d.status === "cancelled_by_client") || (d.side === "pro" && d.status === "cancelled_by_skipper");
      const by = d.status === "cancelled_by_client" ? "από τον πελάτη" : d.status === "cancelled_by_skipper" ? "από τον επαγγελματία" : "";
      return {
        title: self ? "Ακύρωσε κράτηση" : `Η κράτησή του ακυρώθηκε${by ? ` ${by}` : ""}`,
        body: [place(d), d.reason].filter(Boolean).join(" · "),
        tone: "danger",
      };
    }
    case "delivery_request_sent":
      return { title: "Αίτημα μεταφοράς σκάφους", body: [route(d), d.distance_miles && `${d.distance_miles} μίλια`].filter(Boolean).join(" · "), tone: "neutral" };
    case "delivery_confirmed":
      return {
        title: d.side === "client" ? "Μεταφορά επιβεβαιώθηκε" : "Ανέλαβε μεταφορά",
        body: [route(d), d.role && labelForRole(d.role)].filter(Boolean).join(" · "),
        tone: "success",
      };
    case "delivery_cancelled":
      return {
        title: "Μεταφορά ακυρώθηκε",
        body: [route(d), d.by === "professional" ? "από τον επαγγελματία" : d.by === "client" ? "από τον πελάτη" : null, d.reason]
          .filter(Boolean)
          .join(" · "),
        tone: "danger",
      };
    case "wallet_txn": {
      const amount = Number(d.amount ?? 0);
      return { title: WALLET_TXN_LABEL[d.type] || "Κίνηση πορτοφολιού", body: `${amount > 0 ? "+" : ""}${formatMoney(amount)}€`, tone: amount > 0 ? "success" : "neutral" };
    }
    case "dispute_reported":
      return { title: d.self ? "Ανέφερε ακύρωση" : "Αναφέρθηκε γι' αυτόν", body: [d.place, d.reason].filter(Boolean).join(" · "), tone: "warn" };
    case "contact_message":
      return { title: "Μήνυμα επικοινωνίας", body: [TOPIC_LABEL[d.topic], d.status === "handled" ? "απαντήθηκε" : "εκκρεμεί"].filter(Boolean).join(" · "), tone: d.status === "handled" ? "neutral" : "warn" };
    case "email_reset_requested":
      return { title: "Ζήτησε κωδικό επαναφοράς μέσω email", body: d.used ? "χρησιμοποιήθηκε" : "δεν χρησιμοποιήθηκε", tone: "neutral" };
    case "admin_flag":
      return { title: d.type === "duplicate_email" ? "Ίδιο email με άλλον λογαριασμό" : "Σημαία προς έλεγχο", body: d.resolved ? "εξετάστηκε" : "χρειάζεται έλεγχο", tone: d.resolved ? "neutral" : "warn" };
    case "phone_changed":
      return { title: "Άλλαξε τηλέφωνο", body: `νέο: ${d.phone}`, tone: "neutral" };
    case "secondary_role_requested":
      return { title: `Αίτηση για επιπλέον ιδιότητα: ${labelForRole(d.role)}`, body: "", tone: "neutral" };
    case "admin_action": {
      const label = d.action_type === "ban_account" ? banAccountLabel(d.notes) : ACTION_LABEL[d.action_type] || d.action_type;
      return {
        title: label,
        body: [d.notes, !d.self && d.actor_name && `— ${d.actor_name}`].filter(Boolean).join(" "),
        tone: label.includes("Διαγραφή") || label.includes("Αναστολή") ? "danger" : "neutral",
        actor: d.actor_name,
      };
    }
    default:
      return { title: e.kind, body: "", tone: "neutral" };
  }
}
