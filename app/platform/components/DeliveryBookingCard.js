"use client";
import { useEffect, useState } from "react";
import { getDeliveryBookingCounterpart } from "../../../lib/platform/db";
import { labelForRole } from "../../../lib/platform/roles";
import { formatDate, formatMoney } from "../../../lib/platform/notifications";
import { card, muted, colors, money, badge } from "../../../lib/platform/theme";

const STATUS_LABEL = { confirmed: "Επιβεβαιωμένη", completed: "Ολοκληρώθηκε", cancelled: "Ακυρώθηκε" };
const COVER_LABEL = { covers_travel: "Μεταφορικά", covers_fuel: "Καύσιμα", covers_food: "Φαγητό" };

// Ελαφριά κάρτα, ξεχωριστή από το BookingPanel των κρατήσεων πληρώματος —
// η μεταφορά σκάφους έχει διαφορετικό σχήμα (διαδρομή/μίλια αντί για
// περίοδο, τιμή διαπραγματευμένη εκτός πλατφόρμας) και δεν έχει (ακόμα)
// μηνύματα/αξιολογήσεις, οπότε δεν έχει νόημα να ζοριστεί μέσα στο ίδιο
// component.
export default function DeliveryBookingCard({ booking }) {
  const [counterpart, setCounterpart] = useState(null);

  useEffect(() => {
    getDeliveryBookingCounterpart(booking.id).then(setCounterpart).catch(() => {});
  }, [booking.id]);

  const covers = ["covers_travel", "covers_fuel", "covers_food"].filter((k) => booking[k]);

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
        <p style={{ ...muted, fontSize: 12.5, margin: "4px 0 0" }}>Καλύπτεται: {covers.map((k) => COVER_LABEL[k]).join(", ")}</p>
      )}
      <p style={{ margin: "8px 0 0", fontSize: 14 }}>
        Συμφωνημένη τιμή: <span style={{ ...money, color: colors.ink, fontWeight: 600 }}>{formatMoney(booking.offered_price)}€</span>
      </p>
      {counterpart && (
        <p style={{ ...muted, fontSize: 13.5, margin: "8px 0 0" }}>
          Επικοινωνία: <span style={{ ...money, color: colors.ink }}>{counterpart.full_name}</span>
          {counterpart.phone_number ? ` · ${counterpart.phone_number}` : ""}
        </p>
      )}
    </div>
  );
}
