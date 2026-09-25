"use client";
import { colors, radius, muted, fontSans, badge } from "../../../../../lib/platform/theme";
import { timeAgo, formatDateTime } from "../../../../../lib/platform/notifications";
import { describeAuditEvent } from "../../../../../lib/platform/adminAudit";
import { cssImage } from "../../ui";

// Ένα, ξεκάθαρο σύνολο ενοτήτων αντί για μία μακριά σελίδα (§5 του αιτήματος).
// `count(data)` γεμίζει το διακριτικό badge δίπλα στο όνομα κάθε καρτέλας·
// `show(data)` κρύβει καρτέλες που δεν έχουν νόημα για αυτόν τον λογαριασμό
// (π.χ. Διαθεσιμότητα για κάποιον χωρίς προφίλ επαγγελματία).
export const TAB_DEFS = [
  { key: "overview", label: "Επισκόπηση" },
  { key: "profile", label: "Στοιχεία & πρόσβαση" },
  {
    key: "bookings",
    label: "Κρατήσεις & αιτήματα",
    count: (d) =>
      (d.requests?.length || 0) + (d.bookings_client?.length || 0) + (d.bookings_pro?.length || 0) +
      (d.delivery_requests?.length || 0) + (d.delivery_bookings_client?.length || 0) + (d.delivery_bookings_pro?.length || 0),
  },
  { key: "availability", label: "Διαθεσιμότητα", show: (d) => !!d.skipper_profile },
  { key: "finance", label: "Οικονομικά" },
  { key: "actions", label: "Ενέργειες" },
  { key: "history", label: "Ιστορικό", count: (d) => d.timeline?.length || 0 },
];

export function TabBar({ tabs, active, onChange }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        overflowX: "auto",
        borderBottom: `1px solid ${colors.border}`,
        marginBottom: 18,
        WebkitOverflowScrolling: "touch",
      }}
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 14px",
              background: "none",
              border: "none",
              borderBottom: `2px solid ${isActive ? colors.ink : "transparent"}`,
              marginBottom: -1,
              fontFamily: fontSans,
              fontSize: 13.5,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? colors.ink : colors.inkSoft,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
            {t.n > 0 && (
              <span
                style={{
                  minWidth: 18,
                  height: 18,
                  padding: "0 5px",
                  borderRadius: 9,
                  background: isActive ? colors.ink : "#EDEAE4",
                  color: isActive ? "#fff" : colors.inkSoft,
                  fontSize: 11,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {t.n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Επίπεδο πλέγμα ετικέτα/τιμή — για συμπαγή στοιχεία προφίλ, όχι λίστες.
export function InfoGrid({ items }) {
  const rows = items.filter(([, v]) => v !== undefined);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "7px 14px", fontSize: 13.5 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <span style={{ ...muted, fontSize: 12.5 }}>{k}</span>
          <span style={{ color: colors.ink, minWidth: 0, overflowWrap: "break-word" }}>{v ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}

const TONE_DOT = { success: colors.success, danger: colors.danger, warn: colors.warn, neutral: colors.inkSoft };

// Μία γραμμή του ενιαίου ιστορικού — describeAuditEvent αποφασίζει το
// κείμενο, εδώ μόνο η διάταξη (τελεία χρώματος, τίτλος, λεπτομέρεια, πότε).
export function EventRow({ event }) {
  const { title, body, tone } = describeAuditEvent(event);
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "10px 16px",
        borderBottom: `1px solid ${colors.border}`,
        alignItems: "flex-start",
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: 7, height: 7, borderRadius: "50%", background: TONE_DOT[tone] || colors.inkSoft, marginTop: 6, flexShrink: 0 }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13.5, color: colors.ink, fontWeight: 500 }}>{title}</div>
        {body && <div style={{ ...muted, fontSize: 12.5, marginTop: 2 }}>{body}</div>}
      </div>
      <span style={{ ...muted, fontSize: 11.5, flexShrink: 0, whiteSpace: "nowrap" }} title={formatDateTime(event.at)}>
        {timeAgo(event.at)}
      </span>
    </div>
  );
}

export const fieldInput = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 11px",
  fontSize: 13.5,
  fontFamily: "inherit",
  borderRadius: radius.sm,
  border: `1px solid ${colors.border}`,
  color: colors.ink,
};

export function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ display: "block", fontSize: 12, color: colors.inkSoft, marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

// Ίδια κυκλική μεταχείριση με το RowMain της λίστας χρηστών — φωτογραφία αν
// υπάρχει, αλλιώς αρχικά πάνω σε ουδέτερο φόντο. Όχι decoration: είναι το πιο
// γρήγορο «ποιος είναι αυτός» πριν καν διαβάσει κανείς το όνομα.
export function Avatar({ url, name, size = 40 }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const bg = cssImage(url);
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: bg || "#EFEDE8",
        color: colors.inkSoft,
        fontSize: size * 0.4,
        fontWeight: 600,
        fontFamily: fontSans,
      }}
    >
      {!bg && initial}
    </span>
  );
}

export function Chips({ items }) {
  if (!items?.length) return <p style={{ ...muted, fontSize: 13 }}>—</p>;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {items.map((t) => (
        <span key={t} style={{ ...badge("neutral"), fontFamily: "inherit", fontWeight: 400 }}>
          {t}
        </span>
      ))}
    </div>
  );
}

// Ένα σημείωμα κάτω από έναν τίτλο ενότητας — ίδια θέση, ίδιο μέγεθος
// παντού, αντί κάθε καρτέλα να το ξαναφτιάχνει.
export function Hint({ children }) {
  return <p style={{ ...muted, margin: "6px 0 12px", fontSize: 13.5, lineHeight: 1.5 }}>{children}</p>;
}

// Ένα κωδικοποιημένο σφάλμα (από RPC ή API route) -> ελληνικό κείμενο.
// Ένα σημείο αλήθειας για όλες τις καρτέλες, αντί κάθε φόρμα να κρατά το
// δικό της, μερικό αντίγραφο.
export const ERROR_LABEL = {
  not_admin: "Δεν έχεις δικαιώματα admin για αυτή την ενέργεια.",
  not_authenticated: "Η σύνδεσή σου έληξε — μπες ξανά.",
  not_found: "Δεν βρέθηκε ο λογαριασμός.",
  user_not_found: "Δεν βρέθηκε ο λογαριασμός.",
  has_pending_activity: "Έχει ανοιχτό αίτημα ή επιβεβαιωμένη κράτηση. Πρέπει να τακτοποιηθούν πρώτα.",
  already_deleted: "Ο λογαριασμός έχει ήδη διαγραφεί.",
  cannot_delete_admin: "Ο κύριος λογαριασμός διαχειριστή δεν διαγράφεται.",
  cannot_delete_self: "Δεν μπορείς να διαγράψεις τον δικό σου λογαριασμό από εδώ.",
  not_deleted: "Ο λογαριασμός δεν είναι διαγραμμένος.",
  cannot_impersonate_admin: "Δεν γίνεται «Σύνδεση ως» πάνω σε λογαριασμό admin.",
  cannot_impersonate_self: "Δεν μπορείς να κάνεις «Σύνδεση ως» στον δικό σου λογαριασμό.",
  cannot_reset_admin: "Ο κωδικός λογαριασμού admin δεν επαναφέρεται από εδώ.",
  cannot_remove_last_admin: "Δεν μπορείς να αφαιρέσεις τα δικαιώματα admin από τον μόνο admin που έχει απομείνει.",
  cannot_suspend_admin: "Λογαριασμός admin δεν μπορεί να τεθεί σε αναστολή.",
  already_suspended: "Ο λογαριασμός είναι ήδη σε αναστολή.",
  reason_required: "Χρειάζεται λόγος για την αναστολή.",
  not_suspended: "Ο λογαριασμός δεν είναι σε αναστολή.",
  invalid_phone: "Το τηλέφωνο δεν είναι έγκυρο.",
  phone_taken: "Το τηλέφωνο χρησιμοποιείται ήδη από άλλον λογαριασμό.",
  cannot_edit_admin: "Τα στοιχεία λογαριασμού admin δεν αλλάζουν από εδώ.",
  missing_fields: "Λείπουν στοιχεία.",
  missing_user_id: "Λείπουν στοιχεία.",
  name_required: "Χρειάζεται όνομα.",
  price_too_low: "Η τιμή/ημέρα είναι κάτω από το επιτρεπτό όριο.",
  invalid_amount: "Το ποσό δεν είναι έγκυρο.",
  invalid_role: "Μη έγκυρος λογαριασμός για πίστωση.",
  no_photo: "Δεν υπάρχει φωτογραφία να αφαιρεθεί.",
  account_suspended: "Ο λογαριασμός είναι σε αναστολή — δεν γίνεται «Σύνδεση ως». Κάνε πρώτα επαναφορά.",
  license_taken: "Αυτός ο αριθμός διπλώματος ανήκει ήδη σε άλλον επαγγελματία.",
  flag_not_found: "Η σημαία έχει ήδη εξεταστεί.",
  not_configured: "Η υπηρεσία δεν είναι διαθέσιμη αυτή τη στιγμή.",
};

export function errorLabel(err) {
  const code = err?.message || String(err);
  return ERROR_LABEL[code] || code;
}

export { badge };
