"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { listMyDeliveryPings, acceptDeliveryRoleRequest, declineDeliveryRoleRequest } from "../../../lib/platform/db";
import { labelForRole } from "../../../lib/platform/roles";
import { formatDate, formatDateTime } from "../../../lib/platform/notifications";
import { card, sectionLabel, muted, button, colors, money } from "../../../lib/platform/theme";

const ACCEPT_ERRORS = {
  not_open: "Αυτή η θέση δεν είναι πια ανοιχτή.",
  already_resolved: "Έχεις ήδη απαντήσει σε αυτή την προσφορά.",
  expired: "Η προσφορά έληξε.",
  date_overlap: "Έχεις ήδη επιβεβαιωμένη κράτηση ή μεταφορά που επικαλύπτεται με αυτές τις ημερομηνίες.",
  insufficient_wallet: "Δεν έχεις αρκετό υπόλοιπο wallet για τη χρέωση ανάληψης.",
  skipper_not_eligible: "Το προφίλ σου δεν είναι εγκεκριμένο.",
};

const COVER_LABEL = { covers_travel: "Μεταφορικά", covers_fuel: "Καύσιμα", covers_food: "Φαγητό" };

// Ίδιο σχήμα κάρτας με το PingsInbox για τα κανονικά αιτήματα, αλλά για
// προτάσεις μεταφοράς σκάφους — δικά τους πεδία (διαδρομή, μίλια, τιμή),
// δικές τους ενέργειες (accept/decline_delivery_role_request), ίδιο ύφος.
export default function DeliveryPingsInbox({ skipperId }) {
  const { refreshNotifications } = useAuth();
  const [rows, setRows] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    setRows(await listMyDeliveryPings());
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipperId]);

  const pending = rows.filter((r) => r.ping.status === "pending" && r.role_request.status === "open");

  async function handleAccept(roleRequestId) {
    setBusyId(roleRequestId);
    setError("");
    try {
      await acceptDeliveryRoleRequest(roleRequestId, skipperId);
      await load();
      refreshNotifications();
    } catch (err) {
      setError(ACCEPT_ERRORS[err.message] || err.message || String(err));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDecline(roleRequestId) {
    setBusyId(roleRequestId);
    setError("");
    try {
      await declineDeliveryRoleRequest(roleRequestId, skipperId);
      await load();
      refreshNotifications();
    } catch (err) {
      setError(err.message || String(err));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (pending.length === 0) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={sectionLabel}>Προτάσεις μεταφοράς σκάφους ({pending.length})</h2>
      {error && <p style={{ color: colors.danger }}>{error}</p>}
      {pending.map(({ ping, role_request, request }) => {
        const covers = ["covers_travel", "covers_fuel", "covers_food"].filter((k) => request[k]);
        return (
          <div key={role_request.id} style={card}>
            <div style={{ fontWeight: 500, fontSize: 15 }}>
              {request.origin_point} → {request.destination_point} · {labelForRole(role_request.crew_role)}
            </div>
            <p style={{ ...muted, margin: "6px 0 0" }}>
              <span style={money}>{formatDate(request.departure_date)}</span>
              {request.flexible_days > 0 ? ` (±${request.flexible_days} μέρες)` : ""} · {request.distance_miles} μίλια
            </p>
            {covers.length > 0 && (
              <p style={{ ...muted, fontSize: 12.5, margin: "4px 0 0" }}>
                Καλύπτεται: {covers.map((k) => COVER_LABEL[k]).join(", ")}
              </p>
            )}
            <p style={{ ...muted, fontSize: 12, margin: "6px 0 0" }}>Στάλθηκε {formatDateTime(ping.sent_at)}</p>
            {request.notes && <p style={{ ...muted, margin: "6px 0 0" }}>«{request.notes}»</p>}

            <p style={{ margin: "10px 0 0", fontSize: 14 }}>
              Προσφερόμενη τιμή: <span style={{ ...money, color: colors.ink, fontWeight: 600 }}>{role_request.offered_price}€</span>
            </p>
            <p style={{ ...muted, fontSize: 12.5, margin: "4px 0 0" }}>
              Με την ανάληψη χρεώνεσαι <span style={{ ...money, color: colors.ink }}>{role_request.professional_fee}€</span> τέλος πλατφόρμας.
            </p>

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button style={button("primary")} disabled={busyId === role_request.id} onClick={() => handleAccept(role_request.id)}>
                {busyId === role_request.id ? "..." : "Αποδοχή"}
              </button>
              <button style={button("secondary")} disabled={busyId === role_request.id} onClick={() => handleDecline(role_request.id)}>
                Δεν με ενδιαφέρει
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
