"use client";
import { useEffect, useState } from "react";
import { listRequestPings, withdrawPing, cancelBookingRequest, departureLabel } from "../../../lib/platform/db";
import { labelForRole } from "../../../lib/platform/roles";
import { formatDate, formatDateTime } from "../../../lib/platform/notifications";
import { card, muted, badge, button, colors, money } from "../../../lib/platform/theme";

const REQ_STATUS = {
  open: ["Αναμονή διεκδίκησης", "brand"],
  matched: ["Βρέθηκε skipper", "success"],
  expired_unclaimed: ["Άκαρπο — έγινε credit", "warn"],
  cancelled: ["Ακυρώθηκε", "danger"],
};

const PING_STATUS_LABEL = {
  pending: "Αναμονή απάντησης",
  claimed: "Αποδέχτηκε",
};

// An open request used to be a dead end: a card you could look at but never
// touch. This makes it a real screen — who got pinged, and two ways to
// change your mind before anyone answers: drop one person, or pull the
// whole thing back.
export default function RequestPanel({ request, onChanged }) {
  const [expanded, setExpanded] = useState(false);
  const [pings, setPings] = useState([]);
  const [loadingPings, setLoadingPings] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const isOpen = request.status === "open";

  useEffect(() => {
    if (!expanded) return;
    setLoadingPings(true);
    listRequestPings(request.id)
      .then(setPings)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoadingPings(false));
  }, [expanded, request.id]);

  async function handleWithdraw(ping) {
    if (!confirm(`Σίγουρα θέλεις να αφαιρέσεις τον/την ${ping.skipper_profiles?.full_name || "επαγγελματία"} από αυτό το αίτημα;`))
      return;
    setBusyId(ping.id);
    setError("");
    try {
      await withdrawPing(request.id, ping.id);
      setPings((prev) => prev.filter((p) => p.id !== ping.id));
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancelRequest() {
    if (
      !confirm(
        request.fee_paid_at
          ? "Σίγουρα θέλεις να ακυρώσεις όλο το αίτημα; Το τέλος θα επιστραφεί στο πορτοφόλι σου."
          : "Σίγουρα θέλεις να ακυρώσεις όλο το αίτημα;"
      )
    )
      return;
    setBusyId("__all__");
    setError("");
    try {
      await cancelBookingRequest(request.id);
      onChanged?.();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusyId(null);
    }
  }

  const [statusLabel, statusTone] = REQ_STATUS[request.status] || [request.status, "neutral"];

  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((e) => !e)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        style={{ cursor: "pointer", padding: "14px 18px" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontWeight: 500 }}>
            {departureLabel(request)} · {request.boat_types?.name}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={badge(statusTone)}>{statusLabel}</span>
            <span
              style={{
                color: colors.inkSoft,
                fontSize: 14,
                transform: expanded ? "rotate(180deg)" : "none",
                transition: "transform 0.15s ease",
              }}
              aria-hidden="true"
            >
              ⌄
            </span>
          </span>
        </div>
        <p style={{ ...muted, margin: "6px 0 0" }}>
          <span style={money}>{formatDate(request.start_date)}</span> → <span style={money}>{formatDate(request.end_date)}</span>
          {" · Fee "}
          <span style={{ ...money, color: colors.ink }}>{request.fee_amount}€</span>
          {" · "}
          {request.fee_paid_at ? "Πληρώθηκε" : "Δεν πληρώθηκε"}
        </p>
        <p style={{ ...muted, fontSize: 12, margin: "4px 0 0" }}>Στάλθηκε {formatDateTime(request.created_at)}</p>
      </div>

      {expanded && (
        <div style={{ padding: "0 18px 18px", borderTop: `1px solid ${colors.border}`, paddingTop: 14 }}>
          {loadingPings && <p style={muted}>Φόρτωση...</p>}
          {!loadingPings && pings.length === 0 && <p style={muted}>Δεν στάλθηκε σε κανέναν επαγγελματία ακόμα.</p>}
          {!loadingPings &&
            pings.map((p) => {
              const sp = p.skipper_profiles;
              const declined = p.status === "missed" && p.declined_at;
              const missedRace = p.status === "missed" && !p.declined_at;
              return (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    {sp?.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={sp.photo_url}
                        alt=""
                        style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        style={{ width: 36, height: 36, borderRadius: "50%", background: "#EFEDE8", flexShrink: 0 }}
                      />
                    )}
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 500 }}>{sp?.full_name || "—"}</span>
                      <span style={{ ...muted, fontSize: 12.5 }}>
                        {labelForRole(sp?.role) || "Επαγγελματίας"}
                        {" · "}
                        {declined ? "Αρνήθηκε" : missedRace ? "Δεν πρόλαβε" : PING_STATUS_LABEL[p.status] || p.status}
                      </span>
                    </span>
                  </span>
                  {isOpen && p.status === "pending" && (
                    <button
                      type="button"
                      disabled={busyId === p.id}
                      onClick={() => handleWithdraw(p)}
                      style={{ ...button("secondary"), padding: "6px 12px", fontSize: 12.5, flexShrink: 0 }}
                    >
                      {busyId === p.id ? "..." : "Αφαίρεση"}
                    </button>
                  )}
                </div>
              );
            })}

          {isOpen && (
            <div style={{ marginTop: 14 }}>
              <button
                type="button"
                disabled={busyId === "__all__"}
                onClick={handleCancelRequest}
                style={button("danger")}
              >
                {busyId === "__all__" ? "..." : "Ακύρωση ολόκληρου αιτήματος"}
              </button>
              {request.fee_paid_at && (
                <p style={{ ...muted, fontSize: 12, margin: "8px 0 0" }}>
                  Το τέλος αιτήματος ({request.fee_amount}€) θα επιστραφεί στο πορτοφόλι σου.
                </p>
              )}
            </div>
          )}

          {error && <p style={{ color: colors.danger, marginTop: 10, fontSize: 13 }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
