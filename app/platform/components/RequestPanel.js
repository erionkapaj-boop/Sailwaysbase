"use client";
import { useTranslations } from "next-intl";
import { useFormat } from "../useFormat";
import { useLocalData } from "../useLocalData";
import { formatCredits } from "../../../lib/platform/credits";
import { useEffect, useState } from "react";
import { listRequestPings, withdrawPing, cancelBookingRequest, departureLabel } from "../../../lib/platform/db";
import { labelForRole } from "../../../lib/platform/roles";
import { card, muted, badge, button, colors, money } from "../../../lib/platform/theme";
import { useConfirm } from "./ConfirmDialog";
import { friendlyError } from "../../../lib/platform/friendlyError";

const REQ_STATUS = {
  open: ["statusOpen", "brand"],
  matched: ["statusMatched", "success"],
  expired_unclaimed: ["statusExpiredRefunded", "warn"],
  cancelled: ["statusCancelled", "danger"],
};

const PING_STATUS_LABEL = {
  pending: "pingPending",
  claimed: "pingClaimed",
};

// An open request used to be a dead end: a card you could look at but never
// touch. This makes it a real screen — who got pinged, and two ways to
// change your mind before anyone answers: drop one person, or pull the
// whole thing back.
// onToastMessage is owned by the parent page, not this component: cancelling
// moves the request out of the open list and into history, which unmounts
// this exact instance — a toast held in its own local state would vanish
// with it before anyone saw it. The parent renders the toast at page level,
// where it survives regardless of which list the request ends up in.
export default function RequestPanel({ request, onChanged, onToastMessage }) {
  const t = useTranslations("RequestPanel");
  const f = useFormat();
  const L = useLocalData();
  const personName = (sp) => (sp ? L.person(sp) : "");
  const [expanded, setExpanded] = useState(false);
  const [pings, setPings] = useState([]);
  const [loadingPings, setLoadingPings] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [confirm, confirmDialog] = useConfirm();

  const isOpen = request.status === "open";

  useEffect(() => {
    if (!expanded) return;
    setLoadingPings(true);
    listRequestPings(request.id)
      .then(setPings)
      .catch((err) => setError(friendlyError(err)))
      .finally(() => setLoadingPings(false));
  }, [expanded, request.id]);

  async function handleWithdraw(ping) {
    const remaining = pings.filter((p) => p.status === "pending").length;
    const withdrawKey = remaining > 1 ? "withdrawOthers" : request.client_charged_at ? "withdrawLastCharged" : "withdrawLastReserved";
    if (!(await confirm(t(withdrawKey, { name: personName(ping.skipper_profiles) || t("thisCandidate") })))) return;
    setBusyId(ping.id);
    setError("");
    try {
      await withdrawPing(request.id, ping.id);
      setPings((prev) => prev.filter((p) => p.id !== ping.id));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancelRequest() {
    // Από το 0122 το credit χρεώνεται με την αποδοχή: η ακύρωση απλώς το
    // ελευθερώνει. Μόνο τα παλιότερα αιτήματα, χρεωμένα στην αποστολή, επιστρέφονται.
    const charged = Boolean(request.client_charged_at) && request.fee_amount > 0;
    const released = !request.client_charged_at && request.fee_paid_at && request.fee_amount > 0;
    const refundNote = charged
      ? `\n\n${t("refundCharged", { count: Number(request.fee_amount) })}`
      : released
        ? `\n\n${t("refundReleased", { count: Number(request.fee_amount) })}`
        : "";
    if (!(await confirm(`${t("cancelConfirm")}${refundNote}`))) return;
    setBusyId("__all__");
    setError("");
    try {
      await cancelBookingRequest(request.id);
      if (charged) {
        onToastMessage?.(t("toastRefunded", { count: Number(request.fee_amount) }));
      } else if (released) {
        onToastMessage?.(t("toastCancelled"));
      }
      onChanged?.();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusyId(null);
    }
  }

  const [statusKey, statusTone] = REQ_STATUS[request.status] || [null, "neutral"];
  const statusLabel = statusKey ? t(statusKey) : request.status;

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
            {L.text(departureLabel(request))} · {L.text(request.boat_types?.name)}
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
          <span style={money}>{f.dateRange(request.start_date, request.end_date)}</span>
          {" · "}
          {Number(request.fee_amount) === 0 ? (
            t("noCharge")
          ) : (
            t.rich(
              request.client_charged_at ? "feeUsed" : request.fee_paid_at && request.status === "open" ? "feeReserved" : "feePending",
              {
                credits: formatCredits(request.fee_amount),
                count: Number(request.fee_amount),
                m: (chunks) => <span style={{ ...money, color: colors.ink }}>{chunks}</span>,
              }
            )
          )}
        </p>
        <p style={{ ...muted, fontSize: 12, margin: "4px 0 0" }}>
          {t("sentAt", { date: f.dateTime(request.created_at) })}
          {isOpen && request.expires_at && ` · ${t("validUntil", { date: f.dateTime(request.expires_at) })}`}
        </p>
      </div>

      {expanded && (
        <div style={{ padding: "0 18px 18px", borderTop: `1px solid ${colors.border}`, paddingTop: 14 }}>
          {loadingPings && <p style={muted}>{t("loading")}</p>}
          {!loadingPings && pings.length === 0 && <p style={muted}>{t("noPings")}</p>}
          {!loadingPings &&
            pings.map((p, i) => {
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
                      <span style={{ display: "block", fontSize: 14, fontWeight: 500 }}>{personName(sp) || t("candidate", { n: i + 1 })}</span>
                      <span style={{ ...muted, fontSize: 12.5 }}>
                        {labelForRole(sp?.role || request.crew_role) || t("professional")}
                        {" · "}
                        {declined ? t("declined") : missedRace ? t("missedRace") : PING_STATUS_LABEL[p.status] ? t(PING_STATUS_LABEL[p.status]) : p.status}
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
                      {busyId === p.id ? "..." : t("withdraw")}
                    </button>
                  )}
                </div>
              );
            })}

          {!loadingPings && pings.length > 0 && pings.some((p) => !p.skipper_profiles?.full_name) && (
            <p style={{ ...muted, fontSize: 12.5, margin: "10px 0 0" }}>
              {t("detailsAfterAccept")}
            </p>
          )}

          {isOpen && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${colors.border}` }}>
              <button
                type="button"
                disabled={busyId === "__all__"}
                onClick={handleCancelRequest}
                style={button("danger")}
              >
                {busyId === "__all__" ? "..." : t("cancelRequest")}
              </button>
            </div>
          )}

          {error && <p style={{ color: colors.danger, marginTop: 10, fontSize: 13 }}>{error}</p>}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
