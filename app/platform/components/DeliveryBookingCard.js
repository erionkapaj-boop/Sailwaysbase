"use client";
import { useEffect, useState } from "react";
import { getDeliveryBookingCounterpart, cancelDeliveryBooking } from "../../../lib/platform/db";
import { useConfirm } from "./ConfirmDialog";
import { friendlyError } from "../../../lib/platform/friendlyError";
import { labelForRole } from "../../../lib/platform/roles";
import { formatDate, formatMoney } from "../../../lib/platform/notifications";
import { card, muted, colors, money, badge, input, button } from "../../../lib/platform/theme";

const STATUS_LABEL = { confirmed: "Επιβεβαιωμένη", completed: "Ολοκληρώθηκε", cancelled: "Ακυρώθηκε" };
const COVER_LABEL = {
  covers_tickets: "Εισιτήρια μέχρι την αφετηρία",
  covers_travel: "Έξοδα ταξιδιού μέχρι την αφετηρία",
  covers_food: "Διατροφή",
  covers_fuel: "Καύσιμα",
  covers_port_expenses: "Λοιπά έξοδα μεταφοράς",
};

// Ελαφριά κάρτα, ξεχωριστή από το BookingPanel των κρατήσεων πληρώματος —
// η μεταφορά σκάφους έχει διαφορετικό σχήμα (διαδρομή/μίλια αντί για
// περίοδο, τιμή διαπραγματευμένη εκτός πλατφόρμας) και δεν έχει (ακόμα)
// μηνύματα/αξιολογήσεις, οπότε δεν έχει νόημα να ζοριστεί μέσα στο ίδιο
// component.
export default function DeliveryBookingCard({ booking: initial }) {
  const [booking, setBooking] = useState(initial);
  const [counterpart, setCounterpart] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, confirmDialog] = useConfirm();
  // Ο απέναντι χωρίς ιδιότητα είναι ο πελάτης — άρα βλέπει ο επαγγελματίας.
  const iAmPro = counterpart ? counterpart.crew_role == null : null;

  // Ίδιος κανόνας με τις κρατήσεις πληρώματος (0089): όποιος ακυρώνει χάνει
  // τη δική του χρέωση, η άλλη πλευρά παίρνει πίσω τη δική της.
  async function doCancel() {
    const fee = formatMoney(booking.professional_fee_amount);
    const ok = await confirm(
      "Να ακυρωθεί η μεταφορά;\n\n" +
        (iAmPro
          ? `Η χρέωση αποδοχής (${fee}€) δεν επιστρέφεται. Ο πελάτης ειδοποιείται και παίρνει πίσω το τέλος του.`
          : "Το τέλος πλατφόρμας που πλήρωσες δεν επιστρέφεται. Ο επαγγελματίας ειδοποιείται και παίρνει πίσω τη δική του χρέωση."),
      { confirmLabel: "Ακύρωση μεταφοράς", cancelLabel: "Πίσω" }
    );
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      setBooking(await cancelDeliveryBooking(booking.id, reason.trim()));
      setCancelling(false);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    getDeliveryBookingCounterpart(booking.id).then(setCounterpart).catch(() => {});
  }, [booking.id]);

  const covers = ["covers_tickets", "covers_travel", "covers_food", "covers_fuel", "covers_port_expenses"].filter(
    (k) => booking[k]
  );

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontWeight: 500, fontSize: 15 }}>
          {booking.origin_point} → {booking.destination_point} · {labelForRole(booking.crew_role)}
        </span>
        <span style={badge(booking.status === "completed" ? "success" : booking.status === "cancelled" ? "danger" : "brand")}>
          {STATUS_LABEL[booking.status] || booking.status}
        </span>
      </div>
      <p style={{ ...muted, margin: "6px 0 0" }}>
        <span style={money}>{formatDate(booking.departure_date)}</span>
        {booking.flexible_days > 0 ? ` (±${booking.flexible_days} μέρες)` : ""} · {booking.distance_miles} μίλια
      </p>
      {covers.length > 0 && (
        <p style={{ ...muted, fontSize: 12.5, margin: "4px 0 0" }}>
          Καλύπτεται:{" "}
          {covers
            .map((k) =>
              k === "covers_food" && booking.food_allowance_amount != null
                ? `${COVER_LABEL[k]} (${formatMoney(booking.food_allowance_amount)}€)`
                : COVER_LABEL[k]
            )
            .join(", ")}
        </p>
      )}
      <p style={{ margin: "8px 0 0", fontSize: 14 }}>
        Συμφωνημένη τιμή: <span style={{ ...money, color: colors.ink, fontWeight: 600 }}>{formatMoney(booking.offered_price)}€</span>
      </p>
      {counterpart && booking.status !== "cancelled" && (
        <p style={{ ...muted, fontSize: 13.5, margin: "8px 0 0" }}>
          Επικοινωνία: <span style={{ ...money, color: colors.ink }}>{counterpart.full_name}</span>
          {counterpart.phone_number ? (
            <>
              {" · "}
              <a href={`tel:${counterpart.phone_number}`} style={{ color: colors.ink }}>
                {counterpart.phone_number}
              </a>
            </>
          ) : (
            ""
          )}
        </p>
      )}
      {booking.status === "cancelled" && booking.cancelled_by && (
        <p style={{ ...muted, fontSize: 13, margin: "8px 0 0" }}>
          {(booking.cancelled_by === "professional") === !!iAmPro ? "Την ακύρωσες εσύ" : `Ακυρώθηκε από ${booking.cancelled_by === "client" ? "τον πελάτη" : "τον επαγγελματία"}`}
          {booking.cancellation_reason ? ` — «${booking.cancellation_reason}»` : ""}.
        </p>
      )}
      {booking.status === "confirmed" && counterpart && (
        <div style={{ marginTop: 12 }}>
          {cancelling ? (
            <div>
              <input
                style={{ ...input, marginBottom: 8 }}
                placeholder="Λόγος (προαιρετικά — τον βλέπει η άλλη πλευρά)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" style={button("danger")} disabled={busy} onClick={doCancel}>
                  {busy ? "…" : "Ακύρωση μεταφοράς"}
                </button>
                <button type="button" style={button("secondary")} disabled={busy} onClick={() => setCancelling(false)}>
                  Πίσω
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCancelling(true)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: colors.inkSoft, fontSize: 13 }}
            >
              Ακύρωση μεταφοράς
            </button>
          )}
          {error && <p style={{ color: colors.danger, fontSize: 13, margin: "8px 0 0" }}>{error}</p>}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
