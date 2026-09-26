import { describeNotification } from "./notifications";

// Which notifications also go out by email. Everything a person has to act on
// or would want to know away from the app; not wallet movements, which only
// echo an action the person just took themselves (or come with their own
// notification, like a refund with «request_expired»).
export const EMAIL_KINDS = [
  "request_received",
  "offer_received",
  "account_restored",
  "account_verified",
  "booking_confirmed",
  "delivery_request_received",
  "delivery_accepted",
  "request_expired",
  "delivery_expired",
  "delivery_cancelled",
  "admin_delivery_cancelled",
  "coverage_needed",
  "replacement_candidate_available",
  "replacement_not_selected",
  "replacement_offer_closed",
  "replacement_choice_expired",
  "replacement_unfilled",
  "booking_cancelled",
  "review_received",
  "review_prompt",
  "contact_message",
  "admin_signup_pending",
  "admin_pro_pending",
  "admin_role_pending",
  "admin_dispute_new",
  "photo_removed",
  "profile_approved",
  "profile_rejected",
  "role_approved",
  "role_rejected",
];

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// One email per person per run, however many notifications they have: the
// same wording as the bell in the app, each with its own link.
export function buildNotificationEmail({ name, items, baseUrl }) {
  const described = items.map((n) => ({ ...describeNotification(n), url: baseUrl + (n.link || "/platform") }));
  const urgent = described.some((d) => d.urgent);
  const subject =
    described.length === 1
      ? described[0].title
      : `${described.length} νέες ειδοποιήσεις${urgent ? " — κάποιες περιμένουν απάντησή σου" : ""}`;
  const firstName = (name || "").trim().split(/\s+/)[0];
  const greeting = firstName ? `Γεια σου ${firstName},` : "Γεια σου,";
  const settingsUrl = `${baseUrl}/platform/profile`;

  const text = [
    greeting,
    "",
    ...described.flatMap((d) => [`• ${d.title}${d.body ? ` — ${d.body}` : ""}`, `  ${d.url}`]),
    "",
    `Δεν θέλεις αυτά τα email; Κλείσ' τα από το προφίλ σου: ${settingsUrl}`,
  ].join("\n");

  const rows = described
    .map(
      (d) => `
      <tr><td style="padding:14px 0;border-bottom:1px solid #E5E7EB">
        <div style="font-size:15px;font-weight:600;color:#0F1B2D">${escapeHtml(d.title)}</div>
        ${d.body ? `<div style="font-size:14px;color:#4B5563;margin-top:4px">${escapeHtml(d.body)}</div>` : ""}
        <a href="${escapeHtml(d.url)}" style="display:inline-block;margin-top:10px;font-size:14px;color:#0F1B2D;font-weight:600">Άνοιγμα →</a>
      </td></tr>`
    )
    .join("");
  const html = `<!doctype html><html lang="el"><body style="margin:0;background:#F6F7F9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;padding:24px">
        <tr><td style="font-size:15px;color:#0F1B2D;padding-bottom:4px">${escapeHtml(greeting)}</td></tr>
        ${rows}
        <tr><td style="padding-top:18px;font-size:12px;color:#6B7280">
          Δεν θέλεις αυτά τα email; <a href="${escapeHtml(settingsUrl)}" style="color:#6B7280">Κλείσ' τα από το προφίλ σου</a>.
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;

  return { subject, text, html };
}
