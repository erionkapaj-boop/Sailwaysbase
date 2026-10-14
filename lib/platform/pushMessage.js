import { describeNotification } from "./notifications.js";

// Το κείμενο μιας ειδοποίησης στο κινητό. Για όσα έχουν ήδη κείμενο στην
// εφαρμογή (το «κουδούνι») είναι το ίδιο κείμενο· τα μηνύματα συνομιλίας
// δείχνουν μόνο ότι υπάρχει νέο μήνυμα, ποτέ το περιεχόμενο (φαίνεται στην
// οθόνη κλειδώματος).
//   row         μία γραμμή της ουράς: { kind, data, link, unread }
//   translators { t (namespace «Push»), tNotification, tRole, locale }
export function buildPushMessage(row, { t, tNotification, tRole, locale = "el" }) {
  let title;
  let body = "";
  if (row.kind === "message_received") {
    title = t("messageTitle");
    body = t("messageBody");
  } else if (row.kind === "push_test") {
    title = t("testTitle");
    body = t("testBody");
  } else {
    const d = describeNotification({ kind: row.kind, data: row.data || {}, created_at: row.created_at }, locale, tNotification, tRole);
    title = d?.title || t("fallbackTitle");
    body = d?.body || "";
  }
  const link = typeof row.link === "string" && row.link.startsWith("/") ? row.link : "/platform";
  return {
    title,
    body,
    url: link,
    // Ίδια ετικέτα = η νεότερη αντικαθιστά την παλιότερη, αλλά ξαναχτυπά.
    tag: `${row.kind}:${row.kind === "message_received" ? row.data?.booking_id || link : row.id || link}`,
    badge: Number.isFinite(row.unread) ? Math.max(0, Math.min(99, row.unread)) : undefined,
  };
}
