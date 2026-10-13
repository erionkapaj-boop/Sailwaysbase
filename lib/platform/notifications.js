import { formatCredits } from "./credits.js";
import * as fmt from "./format.js";
import { tNow, currentLocale } from "./tNow.js";
import { localizeData, localizeName } from "./localData.js";

// Wording lives here rather than baked into the rows the database writes, so
// rephrasing anything is a code change instead of a migration — and every
// notification already stored picks up the new wording too.

const TOPICS = ["general", "booking", "payment", "report", "privacy", "other"];

// Ίδιες ετικέτες με τη φόρμα επικοινωνίας και τη σελίδα του διαχειριστή.
export const TOPIC_LABEL = {};
for (const k of TOPICS) Object.defineProperty(TOPIC_LABEL, k, { enumerable: true, get: () => tNow("Notification", `topic.${k}`) });

// ΠΑΛΙΕΣ ΣΥΝΑΡΤΗΣΕΙΣ ΜΟΡΦΟΠΟΙΗΣΗΣ — μόνο ελληνικά, με σκοπό να φύγουν.
// Νέος κώδικας χρησιμοποιεί το useFormat() (app/platform/useFormat.js), που
// ακολουθεί τη γλώσσα της σελίδας, ή το lib/platform/format.js με ρητή γλώσσα
// (emails, διακομιστής). Το scripts/check-i18n.mjs μετρά πόσες χρήσεις μένουν
// και δεν αφήνει τον αριθμό να ανέβει· αγγλικά δεν ανοίγουν όσο μένει έστω μία.
export function formatDate(isoDate) {
  return fmt.formatDate(isoDate, "el");
}

export function formatMoney(n) {
  if (n == null) return n;
  return Math.round(Number(n) * 100) / 100;
}

export function formatDateRange(startDate, endDate) {
  return fmt.formatDateRange(startDate, endDate, "el");
}

// Τα κείμενα ζουν στα messages (namespace «Notification»). Στον browser διαβάζονται
// στη γλώσσα της σελίδας· στα emails περνά ρητά η γλώσσα και ο μεταφραστής του
// παραλήπτη: describeNotification(n, locale, t, tRole) με t = translatorFor(locale, "Notification")
// και tRole = translatorFor(locale, "Roles").
export function describeNotification(
  n,
  locale = currentLocale(),
  t = (k, v) => tNow("Notification", k, v),
  tRole = (k) => tNow("Roles", k)
) {
  const d = n.data || {};
  const dates = () => (d?.start && d?.end ? fmt.formatDateRange(d.start, d.end, locale) : "");
  const role = (key) => tRole(`role.${key}.label`);
  const credits = (v) => formatCredits(v);
  const loc = (v) => localizeData(v, locale);
  const person = (v) => (v ? localizeName(v, locale) : v);
  const port = loc(d.port);
  const route = d.origin && d.destination ? `${loc(d.origin)} → ${loc(d.destination)}` : "";
  const refundText = (v) => (v > 0 ? t("refunded", { count: v }) : "");
  const join = (parts) => parts.filter(Boolean).join(" · ");
  const place = () => join([port, dates()]);

  switch (n.kind) {
    case "request_received":
      return { title: t("requestReceived.title"), body: place(), urgent: true }; // someone else can take it
    // Δεν είναι το ίδιο μήνυμα με το «νέο αίτημα»: εδώ σε διάλεξαν ονομαστικά,
    // και το ποσό μπαίνει μέσα γιατί είναι το πρώτο πράγμα που θα ρωτήσει
    // κάποιος πριν αποδεχτεί.
    case "offer_received": {
      const fee = Number(d.fee ?? 0);
      const replacement = d.origin === "admin_replacement";
      return {
        title: t(replacement ? "offerReceived.titleReplacement" : "offerReceived.title"),
        body: join([
          port,
          dates(),
          // Στην αντικατάσταση η δήλωση ενδιαφέροντος δεν χρεώνει — χρεώνεσαι
          // μόνο αν σε διαλέξει ο πελάτης.
          fee > 0
            ? t(replacement ? "offerReceived.feeReplacement" : "offerReceived.feeOnAccept", { credits: credits(fee) })
            : t("offerReceived.noFee"),
          d.note && `«${d.note}»`,
        ]),
        urgent: true, // κι εδώ την παίρνει όποιος προλάβει
      };
    }
    case "account_restored":
      return { title: t("accountRestored.title"), body: t("accountRestored.body") };
    case "account_verified":
      return { title: t("accountVerified.title"), body: t("accountVerified.body") };
    case "booking_confirmed":
      if (d.replacement && d.pro_name) return { title: t("bookingConfirmed.titleNewPro", { name: person(d.pro_name) }), body: place() };
      return { title: t(d.replacement ? "bookingConfirmed.titleReplacement" : "bookingConfirmed.title"), body: place() };
    case "delivery_request_received": {
      const price = Number(d.price ?? 0);
      return { title: t("deliveryRequestReceived.title"), body: join([route, price > 0 ? `${price}€` : ""]), urgent: true };
    }
    case "delivery_accepted":
      return { title: t("deliveryAccepted.title"), body: route };
    // 0089: το αίτημα έληξε χωρίς να το αναλάβει κανείς — το τέλος επιστράφηκε.
    // 0122: τα νεότερα δεν είχαν χρεωθεί· το δεσμευμένο credit ελευθερώνεται.
    case "request_expired": {
      const refund = Number(d.refund ?? 0);
      const released = Number(d.released ?? 0);
      return {
        title: t("requestExpired.title"),
        body: join([
          d.role && role(d.role),
          port,
          dates(),
          refundText(refund),
          released > 0 ? t("released", { count: released }) : "",
        ]),
      };
    }
    case "delivery_expired": {
      const refund = Number(d.refund ?? 0);
      return { title: t("deliveryExpired.title"), body: join([route, d.role && role(d.role), refundText(refund)]) };
    }
    case "delivery_cancelled": {
      const refund = Number(d.refund ?? 0);
      return {
        title: t(d.by === "client" ? "deliveryCancelled.titleClient" : "deliveryCancelled.titlePro"),
        body: join([route, d.role && role(d.role), refundText(refund)]),
        urgent: d.by === "professional", // ο πελάτης χρειάζεται νέο άτομο
      };
    }
    case "admin_delivery_cancelled":
      return { title: t("adminDeliveryCancelled.title"), body: join([route, d.role && role(d.role)]), urgent: true };
    case "coverage_needed":
      return {
        title: t(
          d.reason === "client_timeout"
            ? "coverageNeeded.titleClientTimeout"
            : d.reason === "no_response"
              ? "coverageNeeded.titleNoResponse"
              : "coverageNeeded.titleCancelled"
        ),
        body: join([port, dates(), d.reason && d.reason !== "skipper_cancelled" ? t("coverageNeeded.sendNewOffer") : ""]),
        urgent: true,
      };
    case "replacement_candidate_available":
      return {
        title: t("replacementCandidateAvailable.title"),
        body: join([
          port,
          d.decide_by
            ? t("replacementCandidateAvailable.decideBy", { when: fmt.formatDateTime(d.decide_by, locale) })
            : t("replacementCandidateAvailable.chooseFromOptions"),
        ]),
        urgent: true,
      };
    case "replacement_not_selected":
      return { title: t("replacementNotSelected.title"), body: join([port, dates(), t("replacementNotSelected.body")]) };
    case "replacement_offer_closed":
      return {
        title: t("replacementOfferClosed.title"),
        body: join([
          port,
          dates(),
          d.reason === "client_timeout"
            ? t("replacementOfferClosed.clientTimeout")
            : d.reason === "withdrawn"
              ? t("replacementOfferClosed.withdrawn")
              : "",
          t("replacementOfferClosed.free"),
        ]),
      };
    case "replacement_choice_expired":
      return {
        title: t("replacementChoiceExpired.title"),
        body: join([
          port,
          d.reason === "client_timeout" ? t("replacementChoiceExpired.deadlinePassed") : "",
          t("replacementChoiceExpired.searchingAgain"),
        ]),
        urgent: true,
      };
    case "replacement_unfilled": {
      const refund = Number(d.refund ?? 0);
      return { title: t("replacementUnfilled.title"), body: join([port, dates(), refundText(refund)]), urgent: true };
    }
    case "booking_cancelled": {
      const refund = Number(d.refund ?? 0);
      if (d.by === "no_response") return { title: t("bookingCancelled.byClient"), body: place(), urgent: true };
      if (d.by === "professional") {
        return {
          title: t(d.removed ? "bookingCancelled.proRemoved" : "bookingCancelled.proCancelled"),
          // Παλιές ειδοποιήσεις (πριν το 0096) είχαν επιστροφή· οι νέες όχι —
          // το τέλος καλύπτει την αντικατάσταση, δεν ξαναπληρώνεις.
          body: join([port, dates(), refund > 0 ? refundText(refund) : t("bookingCancelled.noNewCharge")]),
          urgent: true,
        };
      }
      return {
        title: t(d.by === "client" ? "bookingCancelled.byClient" : "bookingCancelled.generic"),
        body: join([port, dates(), refundText(refund)]),
      };
    }
    case "review_received":
      return { title: t("reviewReceived.title"), body: d.rating != null ? t("reviewReceived.rating", { rating: d.rating }) : "" };
    case "review_prompt":
      return { title: t("reviewPrompt.title"), body: place(), urgent: true }; // εκκρεμεί ενέργεια, όχι απλή ενημέρωση
    case "wallet": {
      const amount = Number(d.amount ?? 0);
      // The sign already says which direction the money went, so it carries
      // the meaning and the label just names the reason.
      const sign = amount > 0 ? "+" : "";
      const known = ["deposit", "purchase", "requestFee", "claimFee", "refundCredit", "adjustment"];
      const camel = String(d.txn_type || "").replace(/_(\w)/g, (_, c) => c.toUpperCase());
      return { title: t(known.includes(camel) ? `txn.${camel}` : "txn.other"), body: `${sign}${credits(amount)}` };
    }
    // Φτάνει μόνο σε διαχειριστές, από τη δημόσια φόρμα επικοινωνίας.
    case "contact_message":
      return {
        title: t("contactMessage.title"),
        body: join([person(d.name), TOPICS.includes(d.topic) ? t(`topic.${d.topic}`) : ""]),
        // Μια αναφορά χρήστη ή ένα αίτημα ΓΚΠΔ έχει προθεσμία — δεν περιμένει
        // στη σειρά μαζί με τις γενικές ερωτήσεις.
        urgent: d.topic === "report" || d.topic === "privacy",
      };
    // Προς διαχειριστές (0086): ό,τι περιμένει απόφασή τους.
    case "admin_signup_pending":
      return { title: t("adminSignupPending.title"), body: person(d.name) || "", urgent: true };
    case "admin_credit_purchase":
      return {
        title: t("adminCreditPurchase.title"),
        body: join([person(d.name), d.credits != null && credits(d.credits), d.price != null && `${formatMoney(d.price)}€`, d.reference]),
        urgent: true,
      };
    case "admin_health_issue":
      return { title: t(d.again ? "adminHealthIssue.titleAgain" : "adminHealthIssue.titleNew"), body: join([loc(d.title), loc(d.area)]), urgent: true };
    case "credit_purchase_cancelled":
      return { title: t("creditPurchaseCancelled.title"), body: join([d.credits != null && credits(d.credits), d.reference]) };
    case "admin_pro_pending":
      return { title: t("adminProPending.title"), body: join([person(d.name), d.role && role(d.role)]), urgent: true };
    case "admin_role_pending":
      return { title: t("adminRolePending.title"), body: join([person(d.name), d.role && role(d.role)]), urgent: true };
    case "admin_dispute_new":
      return { title: t("adminDisputeNew.title"), body: join([port, d.start && fmt.formatDate(d.start, locale)]), urgent: true };
    // Προς τον επαγγελματία (0086): η απόφαση για το προφίλ του.
    case "photo_removed":
      return { title: t("photoRemoved.title"), body: t("photoRemoved.body") };
    case "profile_approved":
      return { title: t("profileApproved.title"), body: t("profileApproved.body") };
    case "profile_rereview":
      return { title: t("profileRereview.title"), body: t("profileRereview.body"), urgent: true };
    case "profile_rejected":
      return { title: t(d.revoked ? "profileRejected.titleRevoked" : "profileRejected.title"), body: t("profileRejected.body") };
    case "role_approved":
      return { title: t("roleApproved.title", { role: role(d.role) }), body: t("roleApproved.body") };
    case "role_rejected":
      return { title: t("roleRejected.title", { role: role(d.role) }), body: t("roleRejected.body") };
    default:
      return { title: t("default.title"), body: "" };
  }
}

// A precise moment, not a relative one — for the two questions timeAgo can't
// answer well once more than a day or two has passed: exactly when was this
// request posted, exactly when did this booking get confirmed. Both matter
// for a dispute ("μου έστειλες μήνυμα τέτοια ώρα") in a way "πριν 3 ημέρες"
// doesn't.
export function formatDateTime(iso) {
  return fmt.formatDateTime(iso, "el");
}

export function timeAgo(iso) {
  return fmt.timeAgo(iso, "el");
}
