import { formatCredits } from "./credits.js";
import * as fmt from "./format.js";
import { formatMoney } from "./notifications.js";
import { tNow, currentLocale } from "./tNow.js";
import { localizeData, localizeName } from "./localData.js";

// Ετικέτες για το ενιαίο ιστορικό λογαριασμού (admin_account_detail's
// `timeline`, 0091) — ίδιο μοτίβο με describeNotification: η συνάρτηση
// φέρνει (kind, data) ακατέργαστο, το κείμενο ζει στα messages (namespace
// «AdminAudit»). describeAuditEvent(e, locale, t, tRole): στον browser
// ακολουθεί τη γλώσσα της σελίδας· σε διακομιστή περνά ρητά η γλώσσα και οι
// μεταφραστές (translatorFor(locale, "AdminAudit") / "Roles").

const WALLET_TXN_KEY = {
  purchase: "purchase",
  deposit: "deposit",
  request_fee: "requestFee",
  claim_fee: "claimFee",
  refund_credit: "refundCredit",
  adjustment: "adjustment",
};

// admin_actions.action_type: πριν το 0091 ήταν enum με μόλις 6 τιμές, οπότε
// κάθε νέο είδος ενέργειας από το 0065 και μετά ξαναχρησιμοποιούσε μία από
// αυτές (συνήθως 'ban_account') με το πραγματικό νόημα μόνο στο notes —
// εξ ου και ο διαχωρισμός με βάση το πρόθεμα του notes παρακάτω για τις
// παλιές γραμμές. Οι καινούργιες τιμές (verify_user, edit_profile, ...)
// γράφονται πλέον καθαρές.
const ACTION_KEY = {
  approve_skipper: "approveSkipper",
  reject_skipper: "rejectSkipper",
  resolve_dispute: "resolveDispute",
  edit_booking: "editBooking",
  confirm_wallet_topup: "creditWallet",
  credit_wallet: "creditWallet",
  adjust_wallet: "adjustWallet",
  verify_user: "verifyUser",
  reset_pin: "resetPin",
  impersonate_start: "impersonateStart",
  impersonate_end: "impersonateEnd",
  edit_profile: "editProfile",
  edit_contact: "editContact",
  clear_photo: "clearPhoto",
  approve_photo: "approvePhoto",
  resolve_flag: "resolveFlag",
  staff_admin_grant: "staffAdminGrant",
  staff_admin_revoke: "staffAdminRevoke",
  test_account_on: "testAccountOn",
  test_account_off: "testAccountOff",
};

const TOPICS = ["general", "booking", "payment", "report", "privacy", "other"];

// 'ban_account' (η παλιά, ξαναχρησιμοποιημένη τιμή) καλύπτει αναστολή,
// επαναφορά από αναστολή, διαγραφή και επαναφορά από διαγραφή — μόνο το
// πρόθεμα του notes λέει ποιο από τα τέσσερα ήταν. Τα προθέματα είναι ό,τι
// γράφει η βάση στα notes (ελληνικά· δεδομένα, γι' αυτό σε \u).
function banAccountKey(notes) {
  if (notes?.startsWith("\u0391\u03bd\u03b1\u03c3\u03c4\u03bf\u03bb\u03ae:")) return "suspend";
  if (notes?.startsWith("\u0395\u03c0\u03b1\u03bd\u03b1\u03c6\u03bf\u03c1\u03ac \u03b1\u03c0\u03cc \u03b1\u03bd\u03b1\u03c3\u03c4\u03bf\u03bb\u03ae")) return "unsuspend";
  if (notes?.startsWith("\u0395\u03c0\u03b1\u03bd\u03b1\u03c6\u03bf\u03c1\u03ac \u03b4\u03b9\u03b1\u03b3\u03c1\u03b1\u03bc\u03bc\u03ad\u03bd\u03bf\u03c5")) return "restore";
  if (notes?.startsWith("\u0394\u03b9\u03b1\u03b3\u03c1\u03b1\u03c6\u03ae")) return "delete";
  return "other";
}

export function describeAuditEvent(
  e,
  locale = currentLocale(),
  t = (k, v) => tNow("AdminAudit", k, v),
  tRole = (k) => tNow("Roles", k)
) {
  const d = e.data || {};
  const roleLabel = (key) => (["skipper", "hostess", "cook", "deckhand"].includes(key) ? tRole(`role.${key}.label`) : key);
  const join = (parts) => parts.filter(Boolean).join(" \u00b7 ");
  const place = () =>
    join([localizeData(d.place, locale), d.start_date && d.end_date ? fmt.formatDateRange(d.start_date, d.end_date, locale) : fmt.formatDate(d.start_date, locale)]);
  const route = () => (d.origin_point && d.destination_point ? `${localizeData(d.origin_point, locale)} \u2192 ${localizeData(d.destination_point, locale)}` : "");
  const nm = (v) => localizeName(v, locale);

  switch (e.kind) {
    case "account_created":
      return { title: t("accountCreated.title"), body: d.role === "skipper" ? t("accountCreated.asProfessional") : t("accountCreated.asClient"), tone: "neutral" };
    case "login_success":
      return { title: t("login"), body: "", tone: "neutral" };
    case "login_failed":
      return { title: t("loginFailed.title"), body: t("loginFailed.body"), tone: "warn" };
    case "request_sent":
      return { title: t("requestSent", { role: roleLabel(d.role) }), body: place(), tone: "neutral" };
    case "booking_confirmed":
      return {
        title: d.side === "client" ? t("bookingConfirmed.client") : t("bookingConfirmed.pro"),
        body: join([place(), d.counterpart && (d.side === "client" ? t("bookingConfirmed.withName", { name: nm(d.counterpart) }) : t("bookingConfirmed.forName", { name: nm(d.counterpart) }))]),
        tone: "success",
      };
    case "booking_cancelled": {
      // Ποιος ακύρωσε το λέει το status, όχι η πλευρά: ο πελάτης μιας
      // κράτησης που ακύρωσε ο επαγγελματίας δεν «ακύρωσε κράτηση».
      const self =
        (d.side === "client" && d.status === "cancelled_by_client") || (d.side === "pro" && d.status === "cancelled_by_skipper");
      const by = d.status === "cancelled_by_client" ? "client" : d.status === "cancelled_by_skipper" ? "professional" : "none";
      return {
        title: self ? t("bookingCancelled.self") : t("bookingCancelled.other", { by }),
        body: join([place(), d.reason]),
        tone: "danger",
        userText: Boolean(d.reason),
      };
    }
    case "delivery_request_sent":
      return { title: t("deliveryRequest.title"), body: join([route(), d.distance_miles && t("deliveryRequest.miles", { miles: d.distance_miles })]), tone: "neutral" };
    case "delivery_confirmed":
      return {
        title: d.side === "client" ? t("deliveryConfirmed.client") : t("deliveryConfirmed.pro"),
        body: join([route(), d.role && roleLabel(d.role)]),
        tone: "success",
      };
    case "delivery_cancelled":
      return {
        title: t("deliveryCancelled.title"),
        body: join([route(), d.by === "professional" ? t("deliveryCancelled.byProfessional") : d.by === "client" ? t("deliveryCancelled.byClient") : null, d.reason]),
        tone: "danger",
        userText: Boolean(d.reason),
      };
    case "wallet_txn": {
      const amount = Number(d.amount ?? 0);
      const sign = amount > 0 ? "+" : "";
      const body =
        d.unit === "eur"
          ? t("walletEur", { amount: `${sign}${formatMoney(amount)}` })
          : `${sign}${formatCredits(amount)}${d.price_eur != null ? ` \u00b7 ${formatMoney(d.price_eur)}\u20ac` : ""}`;
      return { title: t(`walletTxn.${WALLET_TXN_KEY[d.type] || "other"}`), body, tone: amount > 0 ? "success" : "neutral" };
    }
    case "dispute_reported":
      return { title: d.self ? t("disputeReported.self") : t("disputeReported.other"), body: join([localizeData(d.place, locale), d.reason]), tone: "warn", userText: Boolean(d.reason) };
    case "contact_message":
      return {
        title: t("contactMessage.title"),
        body: join([TOPICS.includes(d.topic) ? t(`topic.${d.topic}`) : undefined, d.status === "handled" ? t("contactMessage.handled") : t("contactMessage.pending")]),
        tone: d.status === "handled" ? "neutral" : "warn",
      };
    case "email_reset_requested":
      return { title: t("emailReset.title"), body: d.used ? t("emailReset.used") : t("emailReset.unused"), tone: "neutral" };
    case "admin_flag":
      return {
        title: d.type === "duplicate_email" ? t("adminFlag.duplicateEmail") : t("adminFlag.other"),
        body: d.resolved ? t("adminFlag.resolved") : t("adminFlag.open"),
        tone: d.resolved ? "neutral" : "warn",
      };
    case "phone_changed":
      return { title: t("phoneChanged.title"), body: t("phoneChanged.body", { phone: d.phone }), tone: "neutral" };
    case "secondary_role_requested":
      return { title: t("secondaryRole", { role: roleLabel(d.role) }), body: "", tone: "neutral" };
    case "admin_action": {
      const banKey = d.action_type === "ban_account" ? banAccountKey(d.notes) : null;
      const actionKey = ACTION_KEY[d.action_type];
      const title = banKey ? t(`ban.${banKey}`) : actionKey ? t(`action.${actionKey}`) : d.action_type;
      return {
        title,
        body: [d.notes, !d.self && d.actor_name && `\u2014 ${nm(d.actor_name)}`].filter(Boolean).join(" "),
        tone: banKey === "suspend" || banKey === "delete" ? "danger" : "neutral",
        actor: d.actor_name && nm(d.actor_name),
        userText: Boolean(d.notes),
      };
    }
    default:
      return { title: e.kind, body: "", tone: "neutral" };
  }
}
