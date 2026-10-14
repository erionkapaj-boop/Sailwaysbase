"use client";
import { formatCredits } from "../../../../lib/platform/credits";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useFormat } from "../../useFormat";
import { useLocalData } from "../../useLocalData";
import { useAuth } from "../../AuthContext";
import BackButton from "../../components/BackButton";
import { labelForRole } from "../../../../lib/platform/roles";
import { formatMoney } from "../../../../lib/platform/notifications";
import {
  listMyDeliveryRequests,
  relistDeliveryRoleRequest,
  searchDeliveryCandidates,
  cancelDeliveryRoleRequest,
} from "../../../../lib/platform/db";
import { useConfirm } from "../../components/ConfirmDialog";
import { container, card, h1, h2, muted, button, input, colors, money, badge, sectionLabel } from "../../../../lib/platform/theme";
import SignedOutNotice from "../../components/SignedOutNotice";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import DeliveryClaimsPanel from "../../components/DeliveryClaimsPanel";
import PlaceMap from "../../components/map/PlaceMap";

const PING_LABEL = {
  pending: ["pingPending", colors.inkSoft],
  accepted: ["pingAccepted", colors.success || colors.accent],
  declined: ["pingDeclined", colors.danger],
};

const ROLE_REQUEST_KEYS = {
  open: "rrOpen",
  filled: "rrFilled",
  cancelled: "rrCancelled",
  expired: "rrExpired",
};

const BOOKING_STATUS_KEYS = { confirmed: "statusConfirmed", completed: "statusCompleted", cancelled: "statusCancelled" };

const COVER_KEYS = ["covers_tickets", "covers_travel", "covers_food", "covers_fuel", "covers_port_expenses"];

const RELIST_ERRORS = ["not_open", "invalid_price", "no_candidates_selected", "invalid_candidate_selection"];

// Ίδιο σκεπτικό με το delivery/page.js — αριθμητική σε strings ημερομηνιών,
// χωρίς Date/timezone εκπλήξεις.
function addDays(isoDate, days) {
  if (!isoDate) return isoDate;
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function RelistForm({ roleRequest, request, onDone }) {
  const t = useTranslations("DeliveryRequests");
  const L = useLocalData();
  const [price, setPrice] = useState(String(formatMoney(roleRequest.offered_price)));
  const [candidates, setCandidates] = useState(null);
  const [selected, setSelected] = useState(
    new Set((roleRequest.pings || []).filter((p) => p.status !== "accepted").map((p) => p.skipper_id))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const start = addDays(request.departure_date, -(request.flexible_days || 0));
    const end = addDays(request.departure_date, request.flexible_days || 0);
    searchDeliveryCandidates(roleRequest.crew_role, start, end).then(setCandidates).catch(() => setCandidates([]));
  }, [roleRequest.crew_role, request.departure_date, request.flexible_days]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    setError("");
    if (!price || Number(price) < 0) {
      setError(t("errPrice"));
      return;
    }
    if (selected.size === 0) {
      setError(t("err_no_candidates_selected"));
      return;
    }
    setBusy(true);
    try {
      await relistDeliveryRoleRequest(roleRequest.id, Number(price), Array.from(selected));
      onDone();
    } catch (err) {
      setError(RELIST_ERRORS.includes(err.message) ? t(`err_${err.message}`) : friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const known = new Map((roleRequest.pings || []).map((p) => [p.skipper_id, p.status]));

  return (
    <div style={{ marginTop: 12, padding: "12px 14px", background: colors.bgSoft || "#F7F5F0", borderRadius: 10 }}>
      <label style={{ fontSize: 12.5, color: colors.inkSoft, display: "block", marginBottom: 4 }}>{t("newPrice")}</label>
      <input type="number" min={0} style={{ ...input, maxWidth: 160, marginBottom: 10 }} value={price} onChange={(e) => setPrice(e.target.value)} />

      {candidates == null && <p style={muted}>{t("loading")}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
        {candidates?.map((s) => (
          <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
            <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
            {s.nationality_country ? L.text(s.nationality_country) : t("candidate")}
            {known.has(s.id) && (
              <span style={{ fontSize: 12, color: PING_LABEL[known.get(s.id)]?.[1] }}>
                ({PING_LABEL[known.get(s.id)] ? t(PING_LABEL[known.get(s.id)][0]) : known.get(s.id)})
              </span>
            )}
          </label>
        ))}
      </div>

      {error && <p style={{ color: colors.danger, fontSize: 13, margin: "0 0 10px" }}>{error}</p>}
      <button style={{ ...button("primary"), padding: "7px 16px", fontSize: 13 }} disabled={busy} onClick={handleSubmit}>
        {busy ? "..." : t("sendNewPrice")}
      </button>
    </div>
  );
}

function RoleRequestRow({ roleRequest, request, onChanged }) {
  const t = useTranslations("DeliveryRequests");
  const f = useFormat();
  const L = useLocalData();
  const personName = (p) => (p ? L.person(p) : "");
  const [relisting, setRelisting] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canRelist = roleRequest.status === "open";
  const fee = Number(roleRequest.client_fee || 0);

  // Όσο δεν την έχει αναλάβει κανείς, η θέση αποσύρεται με πλήρη επιστροφή
  // του τέλους (0089) — π.χ. βρήκες άνθρωπο εκτός εφαρμογής.
  async function withdraw() {
    const ok = await confirm(
      t("withdrawQuestion", { role: labelForRole(roleRequest.crew_role) }) +
        (fee > 0 ? `\n\n${t("withdrawRefund", { fee, credits: formatCredits(fee) })}` : ""),
      { confirmLabel: t("withdrawConfirm"), cancelLabel: t("back") }
    );
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      await cancelDeliveryRoleRequest(roleRequest.id);
      onChanged();
    } catch (err) {
      setError(RELIST_ERRORS.includes(err.message) ? t(`err_${err.message}`) : friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: "12px 0", borderTop: `1px solid ${colors.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontWeight: 600 }}>
          {labelForRole(roleRequest.crew_role)} · <span style={money}>{formatMoney(roleRequest.offered_price)}€</span>
        </span>
        <span
          style={badge(
            roleRequest.status === "filled"
              ? "success"
              : roleRequest.status === "cancelled" || roleRequest.status === "expired"
              ? "danger"
              : "neutral"
          )}
        >
          {ROLE_REQUEST_KEYS[roleRequest.status] ? t(ROLE_REQUEST_KEYS[roleRequest.status]) : roleRequest.status}
        </span>
      </div>

      {(roleRequest.pings || []).length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 10 }}>
          {roleRequest.pings.map((p) => (
            <span key={p.skipper_id} style={{ fontSize: 12.5, color: PING_LABEL[p.status]?.[1] || colors.inkSoft }}>
              {personName(p) || t("candidate")}: {PING_LABEL[p.status] ? t(PING_LABEL[p.status][0]) : p.status}
            </span>
          ))}
        </div>
      )}

      {roleRequest.booking && (
        <p style={{ ...muted, fontSize: 13, margin: "8px 0 0" }}>
          {roleRequest.booking.status === "cancelled" ? (
            roleRequest.booking.cancelled_by === "professional" ? (
              fee > 0 ? t("proCancelledRefund", { fee, credits: formatCredits(fee) }) : t("proCancelled")
            ) : (
              t("youCancelled")
            )
          ) : (
            <>
              {t.rich("accepted", {
                status: BOOKING_STATUS_KEYS[roleRequest.booking.status] ? t(BOOKING_STATUS_KEYS[roleRequest.booking.status]) : roleRequest.booking.status,
                m: (c) => <span style={{ ...money, color: colors.ink }}>{c}</span>,
              })}
            </>
          )}
        </p>
      )}

      {roleRequest.status === "open" && roleRequest.board_open && (
        <>
          <span style={{ ...badge("brand"), marginTop: 8 }}>{t("openBadge")}</span>
          <DeliveryClaimsPanel roleRequest={roleRequest} onChanged={onChanged} />
        </>
      )}

      {roleRequest.status === "open" && roleRequest.expires_at && (
        <p style={{ ...muted, fontSize: 12.5, margin: "6px 0 0" }}>
          {fee > 0
            ? t("expiresRefund", { date: f.dateTime(roleRequest.expires_at), credits: formatCredits(fee) })
            : t("expiresNoFee", { date: f.dateTime(roleRequest.expires_at) })}
        </p>
      )}
      {error && <p style={{ color: colors.danger, fontSize: 13, margin: "6px 0 0" }}>{error}</p>}
      {confirmDialog}

      {canRelist && (
        <div style={{ marginTop: 8, display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
          {!relisting && (
            <button
              type="button"
              disabled={busy}
              onClick={withdraw}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: colors.inkSoft, fontSize: 13 }}
            >
              {busy ? "…" : t("withdraw")}
            </button>
          )}
          {roleRequest.board_open ? null : relisting ? (
            <RelistForm roleRequest={roleRequest} request={request} onDone={() => { setRelisting(false); onChanged(); }} />
          ) : (
            <button
              type="button"
              onClick={() => setRelisting(true)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: colors.accent, fontSize: 13 }}
            >
              {t("raisePrice")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function MyDeliveryRequestsPage() {
  const t = useTranslations("DeliveryRequests");
  const f = useFormat();
  const L = useLocalData();
  const { session, loading } = useAuth();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      setRows(await listMyDeliveryRequests());
    } catch (err) {
      setError(friendlyError(err));
    }
  }
  useEffect(() => {
    if (session) load();
  }, [session]);

  if (loading) return <div style={container}>{t("loading")}</div>;
  if (!session) return <SignedOutNotice />;

  return (
    <div style={container}>
      <BackButton />
      <h1 style={{ ...h1, marginTop: 14 }}>{t("title")}</h1>
      {error && <p style={{ color: colors.danger }}>{error}</p>}
      {rows == null && <p style={muted}>{t("loading")}</p>}
      {rows?.length === 0 && <div style={{ ...card, textAlign: "center", padding: "20px 22px" }}><p style={{ ...muted, margin: 0 }}>{t("empty")}</p></div>}
      {rows?.map(({ request, role_requests }) => (
        <div key={request.id} style={card}>
          <h2 style={{ ...h2, fontSize: 16, margin: "0 0 4px" }}>
            {L.text(request.origin_point)} → {L.text(request.destination_point)}
          </h2>
          <p style={{ ...muted, fontSize: 13, margin: 0 }}>
            {t("miles", { miles: request.distance_miles })} · {f.date(request.departure_date)}
            {request.flexible_days > 0 ? ` (${t("flexDays", { days: request.flexible_days })})` : ""}
          </p>
          {(() => {
            const covers = COVER_KEYS.filter((k) => request[k]);
            if (covers.length === 0) return null;
            return (
              <p style={{ ...muted, fontSize: 12.5, margin: "4px 0 0" }}>
                {t("covered")}{" "}
                {covers
                  .map((k) =>
                    k === "covers_food" && request.food_allowance_amount != null
                      ? `${t(k)} (${formatMoney(request.food_allowance_amount)}€)`
                      : t(k)
                  )
                  .join(", ")}
              </p>
            );
          })()}
          <PlaceMap from={request.origin_point} to={request.destination_point} showDistance style={{ margin: "14px 0 6px" }} />
          {(role_requests || []).map((rr) => (
            <RoleRequestRow key={rr.id} roleRequest={rr} request={request} onChanged={load} />
          ))}
        </div>
      ))}
    </div>
  );
}
