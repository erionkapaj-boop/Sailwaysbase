// Wording lives here rather than baked into the rows the database writes, so
// rephrasing anything is a code change instead of a migration — and every
// notification already stored picks up the new wording too.

const TXN_LABEL = {
  deposit: "Κατάθεση στο πορτοφόλι σου",
  request_fee: "Πλήρωσες τέλος αιτήματος",
  claim_fee: "Πλήρωσες τέλος διεκδίκησης",
  refund_credit: "Επιστροφή χρημάτων στο πορτοφόλι σου",
};

// Ίδιες ετικέτες με τη φόρμα επικοινωνίας και τη σελίδα του διαχειριστή.
const TOPIC_LABEL = {
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

export function formatDateRange(startDate, endDate) {
  if (!startDate || !endDate) return "";
  return `${formatDate(startDate)} → ${formatDate(endDate)}`;
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
            ? "Αντικατάσταση — σου προτείνεται δουλειά"
            : "Σου προτείνεται δουλειά",
        body: [d.port, dates(d), fee > 0 ? `${fee}€ με την αποδοχή` : "χωρίς χρέωση", d.note && `«${d.note}»`]
          .filter(Boolean)
          .join(" · "),
        urgent: true, // κι εδώ την παίρνει όποιος προλάβει
      };
    }
    case "booking_confirmed":
      return {
        title: "Νέα επιβεβαιωμένη κράτηση",
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
    case "coverage_needed":
      return {
        title: "Ακύρωση — χρειάζεται κάλυψη",
        body: [d.port, dates(d)].filter(Boolean).join(" · "),
        urgent: true,
      };
    case "booking_cancelled":
      return {
        title: "Ακυρώθηκε κράτηση",
        body: [d.port, dates(d)].filter(Boolean).join(" · "),
      };
    case "review_received":
      return {
        title: "Έλαβες αξιολόγηση",
        body: d.rating != null ? `${d.rating} στα 5 αστέρια` : "",
      };
    case "review_prompt":
      return {
        title: "Ο ναύλος ολοκληρώθηκε — άφησε αξιολόγηση",
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
  return new Date(iso).toISOString().slice(0, 10);
}
