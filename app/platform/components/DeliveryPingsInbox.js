"use client";
import TopUpSheet from "./credits/TopUpSheet";
import { friendlyError } from "../../../lib/platform/friendlyError";
import { formatCredits } from "../../../lib/platform/credits";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useFormat } from "../useFormat";
import { useAuth } from "../AuthContext";
import { listMyDeliveryPings, acceptDeliveryRoleRequest, declineDeliveryRoleRequest } from "../../../lib/platform/db";
import { labelForRole } from "../../../lib/platform/roles";
import { formatMoney } from "../../../lib/platform/notifications";
import { card, sectionLabel, muted, button, colors, money } from "../../../lib/platform/theme";

const ACCEPT_ERRORS = ["not_open", "already_resolved", "expired", "date_overlap", "insufficient_wallet", "skipper_not_eligible"];

// Ίδιο σχήμα κάρτας με το PingsInbox για τα κανονικά αιτήματα, αλλά για
// προτάσεις μεταφοράς σκάφους — δικά τους πεδία (διαδρομή, μίλια, τιμή),
// δικές τους ενέργειες (accept/decline_delivery_role_request), ίδιο ύφος.
export default function DeliveryPingsInbox({ skipperId }) {
  const t = useTranslations("DeliveryInbox");
  const td = useTranslations("Delivery");
  const f = useFormat();
  const { refreshNotifications, userRow } = useAuth();
  const balance = Number(userRow?.wallet_balance ?? 0);
  const [topUp, setTopUp] = useState(null);
  const [rows, setRows] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  // Ποτέ δεν πετά. Η ενότητα εμφανίζεται μόνο όταν υπάρχει κάτι, οπότε μια
  // αποτυχία φόρτωσης απλώς την αφήνει κρυφή (και ξαναδοκιμάζει στην επόμενη ενέργεια).
  async function load() {
    try {
      setRows(await listMyDeliveryPings());
    } catch {
      // κρατάμε ό,τι είχε φορτωθεί
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipperId]);

  const pending = rows.filter(
    (r) =>
      r.ping.status === "pending" &&
      r.role_request.status === "open" &&
      new Date(r.role_request.expires_at).getTime() > Date.now()
  );

  async function handleAccept(roleRequestId, fee) {
    setError("");
    if (fee > balance) {
      setTopUp({ need: fee, roleRequestId, fee });
      return;
    }
    setBusyId(roleRequestId);
    try {
      await acceptDeliveryRoleRequest(roleRequestId, skipperId);
      await load();
      refreshNotifications();
    } catch (err) {
      if (err.message === "insufficient_wallet") setTopUp({ need: Math.max(1, Number(fee) || 1), roleRequestId, fee });
      else setError(ACCEPT_ERRORS.includes(err.message) ? t(`err_${err.message}`) : friendlyError(err));
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
      setError(friendlyError(err));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (pending.length === 0) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={sectionLabel}>{t("title")}<span style={{ marginLeft: 8, opacity: 0.55 }}>{pending.length}</span></h2>
      {error && <p style={{ color: colors.danger }}>{error}</p>}
      {pending.map(({ ping, role_request, request }) => {
        const covers = ["covers_tickets", "covers_travel", "covers_food", "covers_fuel", "covers_port_expenses"].filter(
          (k) => request[k]
        );
        return (
          <div key={role_request.id} style={card}>
            <div style={{ fontWeight: 500, fontSize: 15 }}>
              {request.origin_point} → {request.destination_point} · {labelForRole(role_request.crew_role)}
            </div>
            <p style={{ ...muted, margin: "6px 0 0" }}>
              <span style={money}>{f.date(request.departure_date)}</span>
              {request.flexible_days > 0 ? ` (${td("flexDays", { days: request.flexible_days })})` : ""} · {td("miles", { miles: request.distance_miles })}
            </p>
            {covers.length > 0 && (
              <p style={{ ...muted, fontSize: 12.5, margin: "4px 0 0" }}>
                {td("coveredLabel")}{" "}
                {covers
                  .map((k) =>
                    k === "covers_food" && request.food_allowance_amount != null
                      ? `${td(k)} (${formatMoney(request.food_allowance_amount)}€)`
                      : td(k)
                  )
                  .join(", ")}
              </p>
            )}
            <p style={{ ...muted, fontSize: 12, margin: "6px 0 0" }}>{t("sentAt", { date: f.dateTime(ping.sent_at) })}</p>
            {/* The client's notes are deliberately NOT shown here: free text could
                contain contact details, which are revealed only after the booking
                is confirmed (0071 already blanks them in the RPC itself). */}

            <p style={{ margin: "10px 0 0", fontSize: 14 }}>
              {t.rich("offeredPrice", { price: `${formatMoney(role_request.offered_price)}€`, m: (c) => <span style={{ ...money, color: colors.ink, fontWeight: 600 }}>{c}</span> })}
            </p>
            <p style={{ ...muted, fontSize: 12.5, margin: "4px 0 0" }}>
              {t.rich("feeNote", { credits: formatCredits(role_request.professional_fee), m: (c) => <span style={{ ...money, color: colors.ink }}>{c}</span> })}
            </p>

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button style={button("primary")} disabled={busyId === role_request.id} onClick={() => handleAccept(role_request.id, Number(role_request.professional_fee) || 0)}>
                {busyId === role_request.id ? "..." : t("accept")}
              </button>
              <button style={button("secondary")} disabled={busyId === role_request.id} onClick={() => handleDecline(role_request.id)}>
                {t("decline")}
              </button>
            </div>
          </div>
        );
      })}
      <TopUpSheet
        open={Boolean(topUp)}
        need={topUp?.need || 0}
        balance={balance}
        onClose={() => setTopUp(null)}
        continueLabel={t("continueAccept")}
        onContinue={() => topUp && handleAccept(topUp.roleRequestId, topUp.fee)}
      />
    </div>
  );
}
