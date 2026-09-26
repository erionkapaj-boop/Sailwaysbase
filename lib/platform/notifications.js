import { labelForRole } from "./roles";

// Wording lives here rather than baked into the rows the database writes, so
// rephrasing anything is a code change instead of a migration — and every
// notification already stored picks up the new wording too.

const TXN_LABEL = {
  deposit: "Κατάθεση στο πορτοφόλι σου",
  request_fee: "Πλήρωσες τέλος αιτήματος",
  claim_fee: "Χρέωση αποδοχής δουλειάς",
  refund_credit: "Επιστροφή χρημάτων στο πορτοφόλι σου",
  adjustment: "Διόρθωση υπολοίπου στο πορτοφόλι σου",
};

// Ίδιες ετικέτες με τη φόρμα επικοινωνίας και τη σελίδα του διαχειριστή.
export const TOPIC_LABEL = {
  general: "Γενική ερώτηση",
  booking: "Κράτηση / αίτημα",
  payment: "Χρέωση / πορτοφόλι",
  report: "Αναφορά",
  privacy: "Προσωπικά δεδομένα",
  other: "Άλλο",
};

function dates(d) {
  return d?.start && d?.end ? formatDateRange(d.start, d.end) : "";
}

// Trip dates (start_date/end_date) are plain DATE columns — "2026-09-25" —
// with no time component, so there's no timezone conversion to worry about;
// a straight string split avoids new Date() silently shifting the day
// depending on the viewer's local timezone. Classic European order (day,
// month, year), matching every other date the app already shows.
export function formatDate(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

// Ποσά υπολογισμένα από μίλια (μεταφορές σκάφους) μπορεί να μην βγαίνουν
// ποτέ στρογγυλά όπως οι σταθερές τιμές αλλού στην εφαρμογή (π.χ. claim fee
// 25€) — καθαρίζει σε 2 δεκαδικά για εμφάνιση, χωρίς να πειράζει το ποσό
// που όντως χρεώνεται (αυτό υπολογίζεται πάντα server-side).
export function formatMoney(n) {
  if (n == null) return n;
  return Math.round(Number(n) * 100) / 100;
}

const MONTH_SHORT = ["Ιαν", "Φεβ", "Μαρ", "Απρ", "Μαΐ", "Ιουν", "Ιουλ", "Αυγ", "Σεπ", "Οκτ", "Νοε", "Δεκ"];

// «25–29 Σεπ 2026», «28 Σεπ – 3 Οκτ 2026», «30 Δεκ 2026 – 2 Ιαν 2027».
// Διαβάζεται όπως θα το έγραφε κανείς, όχι σαν δύο πεδία βάσης δεδομένων.
export function formatDateRange(startDate, endDate) {
  if (!startDate || !endDate) return "";
  const [y1, m1, d1] = startDate.split("-").map(Number);
  const [y2, m2, d2] = endDate.split("-").map(Number);
  if (y1 === y2 && m1 === m2) {
    return d1 === d2 ? `${d1} ${MONTH_SHORT[m1 - 1]} ${y1}` : `${d1}–${d2} ${MONTH_SHORT[m1 - 1]} ${y1}`;
  }
  if (y1 === y2) return `${d1} ${MONTH_SHORT[m1 - 1]} – ${d2} ${MONTH_SHORT[m2 - 1]} ${y2}`;
  return `${d1} ${MONTH_SHORT[m1 - 1]} ${y1} – ${d2} ${MONTH_SHORT[m2 - 1]} ${y2}`;
}

export function describeNotification(n) {
  const d = n.data || {};
  switch (n.kind) {
    case "request_received":
      return {
        title: "Νέο αίτημα κράτησης",
        body: [d.port, dates(d)].filter(Boolean).join(" · "),
        urgent: true, // someone else can take it
      };
    // Δεν είναι το ίδιο μήνυμα με το «νέο αίτημα»: εδώ σε διάλεξαν ονομαστικά,
    // και το ποσό μπαίνει μέσα γιατί είναι το πρώτο πράγμα που θα ρωτήσει
    // κάποιος πριν αποδεχτεί.
    case "offer_received": {
      const fee = Number(d.fee ?? 0);
      return {
        title:
          d.origin === "admin_replacement"
            ? "Αντικατάσταση: σου προτείνεται δουλειά"
            : "Σου προτείνεται δουλειά",
        body: [
          d.port,
          dates(d),
          // Στην αντικατάσταση η δήλωση ενδιαφέροντος δεν χρεώνει — χρεώνεσαι
          // μόνο αν σε διαλέξει ο πελάτης.
          fee > 0
            ? d.origin === "admin_replacement"
              ? `${fee}€ μόνο αν σε επιλέξει ο πελάτης`
              : `${fee}€ με την αποδοχή`
            : "χωρίς χρέωση",
          d.note && `«${d.note}»`,
        ]
          .filter(Boolean)
          .join(" · "),
        urgent: true, // κι εδώ την παίρνει όποιος προλάβει
      };
    }
    case "account_restored":
      return {
        title: "Ο λογαριασμός σου επανήλθε",
        body: "Μπορείς να συνδέεσαι και να χρησιμοποιείς την εφαρμογή κανονικά.",
      };
    case "account_verified":
      return {
        title: "Ο λογαριασμός σου εγκρίθηκε",
        body: "Μπορείς πλέον να στέλνεις αιτήματα σε επαγγελματίες.",
      };
    case "booking_confirmed":
      if (d.replacement && d.pro_name) {
        return {
          title: `Νέος επαγγελματίας για το ταξίδι σου: ${d.pro_name}`,
          body: [d.port, dates(d)].filter(Boolean).join(" · "),
        };
      }
      return {
        title: d.replacement ? "Ανέλαβες την αντικατάσταση" : "Νέα επιβεβαιωμένη κράτηση",
        body: [d.port, dates(d)].filter(Boolean).join(" · "),
      };
    case "delivery_request_received": {
      const price = Number(d.price ?? 0);
      const route = d.origin && d.destination ? `${d.origin} → ${d.destination}` : "";
      return {
        title: "Πρόταση μεταφοράς σκάφους",
        body: [route, price > 0 ? `${price}€` : ""].filter(Boolean).join(" · "),
        urgent: true, // κι εδώ την παίρνει όποιος προλάβει
      };
    }
    case "delivery_accepted": {
      const route = d.origin && d.destination ? `${d.origin} → ${d.destination}` : "";
      return {
        title: "Ανέλαβαν τη μεταφορά σου",
        body: route,
      };
    }
    // 0089: το αίτημα έληξε χωρίς να το αναλάβει κανείς — το τέλος επιστράφηκε.
    case "request_expired": {
      const refund = Number(d.refund ?? 0);
      return {
        title: "Το αίτημά σου έληξε χωρίς απάντηση",
        body: [
          d.role && labelForRole(d.role),
          d.port,
          dates(d),
          refund > 0 ? `επιστράφηκαν ${formatMoney(refund)}€` : "",
        ]
          .filter(Boolean)
          .join(" · "),
      };
    }
    case "delivery_expired": {
      const refund = Number(d.refund ?? 0);
      const route = d.origin && d.destination ? `${d.origin} → ${d.destination}` : "";
      return {
        title: "Κανείς δεν ανέλαβε τη μεταφορά",
        body: [route, d.role && labelForRole(d.role), refund > 0 ? `επιστράφηκαν ${formatMoney(refund)}€` : ""]
          .filter(Boolean)
          .join(" · "),
      };
    }
    case "delivery_cancelled": {
      const refund = Number(d.refund ?? 0);
      const route = d.origin && d.destination ? `${d.origin} → ${d.destination}` : "";
      return {
        title: d.by === "client" ? "Ο πελάτης ακύρωσε τη μεταφορά" : "Ο επαγγελματίας ακύρωσε τη μεταφορά",
        body: [route, d.role && labelForRole(d.role), refund > 0 ? `επιστράφηκαν ${formatMoney(refund)}€` : ""]
          .filter(Boolean)
          .join(" · "),
        urgent: d.by === "professional", // ο πελάτης χρειάζεται νέο άτομο
      };
    }
    case "admin_delivery_cancelled": {
      const route = d.origin && d.destination ? `${d.origin} → ${d.destination}` : "";
      return {
        title: "Επαγγελματίας ακύρωσε μεταφορά",
        body: [route, d.role && labelForRole(d.role)].filter(Boolean).join(" · "),
        urgent: true,
      };
    }
    case "coverage_needed":
      return {
        title:
          d.reason === "client_timeout"
            ? "Αντικατάσταση: ο πελάτης δεν διάλεξε εγκαίρως"
            : d.reason === "no_response"
              ? "Αντικατάσταση: κανείς δεν δήλωσε ενδιαφέρον"
              : "Ακύρωση: χρειάζεται αντικαταστάτης",
        body: [d.port, dates(d), d.reason && d.reason !== "skipper_cancelled" ? "στείλε νέα πρόταση" : ""]
          .filter(Boolean)
          .join(" · "),
        urgent: true,
      };
    case "replacement_candidate_available":
      return {
        title: "Βρέθηκε διαθέσιμος αντικαταστάτης",
        body: [d.port, d.decide_by ? `διάλεξε έως ${formatDateTime(d.decide_by)}` : "διάλεξε από τις επιλογές σου"]
          .filter(Boolean)
          .join(" · "),
        urgent: true,
      };
    case "replacement_not_selected":
      return {
        title: "Δεν επιλέχθηκες για την αντικατάσταση",
        body: [d.port, dates(d), "ο πελάτης διάλεξε άλλον — δεν χρεώθηκες"].filter(Boolean).join(" · "),
      };
    case "replacement_offer_closed":
      return {
        title: "Η πρόταση αντικατάστασης έκλεισε",
        body: [
          d.port,
          dates(d),
          d.reason === "client_timeout"
            ? "ο πελάτης δεν διάλεξε εγκαίρως"
            : d.reason === "withdrawn"
              ? "την απέσυρε η διαχείριση"
              : "",
          "δεν χρεώθηκες, είσαι ελεύθερος για άλλες δουλειές",
        ]
          .filter(Boolean)
          .join(" · "),
      };
    case "replacement_choice_expired":
      return {
        title: "Οι επιλογές αντικαταστάτη δεν ισχύουν πια",
        body: [
          d.port,
          d.reason === "client_timeout" ? "πέρασε η προθεσμία επιλογής" : "",
          "ψάχνουμε ξανά και θα σε ειδοποιήσουμε",
        ]
          .filter(Boolean)
          .join(" · "),
        urgent: true,
      };
    case "replacement_unfilled": {
      const refund = Number(d.refund ?? 0);
      return {
        title: "Δεν βρέθηκε αντικαταστάτης",
        body: [d.port, dates(d), refund > 0 ? `επιστράφηκαν ${formatMoney(refund)}€ στο πορτοφόλι σου` : ""]
          .filter(Boolean)
          .join(" · "),
        urgent: true,
      };
    }
    case "booking_cancelled": {
      const refund = Number(d.refund ?? 0);
      if (d.by === "professional") {
        return {
          title: "Ο επαγγελματίας ακύρωσε. Ψάχνουμε αντικαταστάτη",
          // Παλιές ειδοποιήσεις (πριν το 0096) είχαν επιστροφή· οι νέες όχι —
          // το τέλος καλύπτει την αντικατάσταση, δεν ξαναπληρώνεις.
          body: [
            d.port,
            dates(d),
            refund > 0 ? `επιστράφηκαν ${formatMoney(refund)}€` : "δεν χρειάζεται να πληρώσεις ξανά",
          ]
            .filter(Boolean)
            .join(" · "),
          urgent: true,
        };
      }
      return {
        title: d.by === "client" ? "Ο πελάτης ακύρωσε την κράτηση" : "Ακυρώθηκε κράτηση",
        body: [d.port, dates(d), refund > 0 ? `επιστράφηκαν ${formatMoney(refund)}€` : ""].filter(Boolean).join(" · "),
      };
    }
    case "review_received":
      return {
        title: "Έλαβες αξιολόγηση",
        body: d.rating != null ? `${d.rating} στα 5 αστέρια` : "",
      };
    case "review_prompt":
      return {
        title: "Το ταξίδι ολοκληρώθηκε. Πώς πήγε;",
        body: [d.port, dates(d)].filter(Boolean).join(" · "),
        urgent: true, // εκκρεμεί ενέργεια, όχι απλή ενημέρωση
      };
    case "wallet": {
      const amount = Number(d.amount ?? 0);
      // The sign already says which direction the money went, so it carries
      // the meaning and the label just names the reason.
      const sign = amount > 0 ? "+" : "";
      return {
        title: TXN_LABEL[d.txn_type] || "Κίνηση πορτοφολιού",
        body: `${sign}${amount}€`,
      };
    }
    // Φτάνει μόνο σε διαχειριστές, από τη δημόσια φόρμα επικοινωνίας.
    case "contact_message":
      return {
        title: "Νέο μήνυμα επικοινωνίας",
        body: [d.name, TOPIC_LABEL[d.topic]].filter(Boolean).join(" · "),
        // Μια αναφορά χρήστη ή ένα αίτημα ΓΚΠΔ έχει προθεσμία — δεν περιμένει
        // στη σειρά μαζί με τις γενικές ερωτήσεις.
        urgent: d.topic === "report" || d.topic === "privacy",
      };
    // Προς διαχειριστές (0086): ό,τι περιμένει απόφασή τους.
    case "admin_signup_pending":
      return {
        title: "Νέα εγγραφή περιμένει επαλήθευση",
        body: d.name || "",
        urgent: true,
      };
    case "admin_pro_pending":
      return {
        title: "Επαγγελματίας περιμένει έγκριση",
        body: [d.name, d.role && labelForRole(d.role)].filter(Boolean).join(" · "),
        urgent: true,
      };
    case "admin_role_pending":
      return {
        title: "Αίτηση για επιπλέον ιδιότητα",
        body: [d.name, d.role && labelForRole(d.role)].filter(Boolean).join(" · "),
        urgent: true,
      };
    case "admin_dispute_new":
      return {
        title: "Νέα αναφορά ακύρωσης",
        body: [d.port, d.start && formatDate(d.start)].filter(Boolean).join(" · "),
        urgent: true,
      };
    // Προς τον επαγγελματία (0086): η απόφαση για το προφίλ του.
    case "photo_removed":
      return {
        title: "Η φωτογραφία σου αφαιρέθηκε",
        body: d.reason
          ? `Λόγος: ${d.reason}. Ανέβασε μια νέα, χωρίς στοιχεία επικοινωνίας.`
          : "Δεν επιτρέπονται στοιχεία επικοινωνίας στη φωτογραφία. Ανέβασε μια νέα.",
      };
    case "profile_approved":
      return {
        title: "Το προφίλ σου εγκρίθηκε",
        body: "Δήλωσε διαθεσιμότητα για να εμφανίζεσαι στις αναζητήσεις.",
      };
    case "profile_rejected":
      return {
        title: d.revoked ? "Η έγκριση του προφίλ σου ανακλήθηκε" : "Το προφίλ σου δεν εγκρίθηκε",
        body: "Για λεπτομέρειες επικοινώνησε μαζί μας.",
      };
    case "role_approved":
      return {
        title: `Εγκρίθηκες και ως ${labelForRole(d.role)}`,
        body: "Μπορείς πλέον να δέχεσαι αιτήματα και για αυτή την ιδιότητα.",
      };
    case "role_rejected":
      return {
        title: `Η ιδιότητα ${labelForRole(d.role)} δεν εγκρίθηκε`,
        body: "Για λεπτομέρειες επικοινώνησε μαζί μας.",
      };
    default:
      return { title: "Ενημέρωση", body: "" };
  }
}

// A precise moment, not a relative one — for the two questions timeAgo can't
// answer well once more than a day or two has passed: exactly when was this
// request posted, exactly when did this booking get confirmed. Both matter
// for a dispute ("μου έστειλες μήνυμα τέτοια ώρα") in a way "πριν 3 ημέρες"
// doesn't.
export function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const date = d.toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

// "πριν 5 λεπτά" reads better than a timestamp for anything recent, which is
// what almost everything in this list is.
export function timeAgo(iso) {
  if (!iso) return "";
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "μόλις τώρα";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `πριν ${mins} ${mins === 1 ? "λεπτό" : "λεπτά"}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `πριν ${hours} ${hours === 1 ? "ώρα" : "ώρες"}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `πριν ${days} ${days === 1 ? "ημέρα" : "ημέρες"}`;
  return formatDate(new Date(iso).toISOString().slice(0, 10));
}
