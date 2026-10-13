"use client";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import { formatCredits } from "../../../../lib/platform/credits";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useFormat } from "../../useFormat";
import AdminShell, { useRefreshAdminCounts } from "../AdminShell";
import OfferComposer from "../OfferComposer";
import { Panel, Row, RowMain, Empty, Status, colors, muted, money, button } from "../ui";
import { badge } from "../../../../lib/platform/theme";
import { labelForRole } from "../../../../lib/platform/roles";
import { useConfirm } from "../../components/ConfirmDialog";
import {
  adminReplacementCases,
  adminReplacementCaseDetail,
  adminCancelOffer,
  adminCloseReplacementCase,
} from "../../../../lib/platform/db";

// Ολόκληρη η διαδικασία αντικατάστασης, σε ένα μέρος — μία υπόθεση ανά
// ταξίδι: ακύρωση επαγγελματία → πρόταση σε υποψήφιους → όσοι δηλώσουν
// ενδιαφέρον → επιλογή πελάτη (24 ώρες) → νέα ανάθεση. Αν ακυρώσει και ο
// αντικαταστάτης, η ίδια υπόθεση συνεχίζει (δεν ανοίγει δεύτερη δίπλα).
// Τα κείμενα ζουν στο AdminReplacements· εδώ μόνο κλειδιά και τόνοι.
const STAGE_TONE = {
  needs_action: "warn",
  awaiting_skippers: "neutral",
  awaiting_client: "brand",
  completed: "success",
  closed_unfilled: "neutral",
};

const OFFER_CLOSED = ["no_response", "client_timeout", "withdrawn", "case_closed"];

const ERRORS = ["case_closed", "not_latest_in_trip", "not_awaiting_cover", "request_not_open"];
function message(err, t) {
  const code = (err.message || "").match(/[a-z_]+/)?.[0];
  return ERRORS.includes(code) ? t(`err_${code}`) : friendlyError(err);
}

function recipientState(r) {
  if (r.status === "claimed") return ["recClaimed", "success", null];
  if (r.declined_at) return ["recDeclined", "neutral", r.declined_at];
  if (r.withdrawn_at) return ["recWithdrawn", "neutral", r.withdrawn_at];
  if (r.candidate_at)
    return r.status === "pending"
      ? ["recCandidate", "brand", r.candidate_at]
      : ["recNotChosen", "neutral", r.candidate_at];
  return [r.status === "missed" ? "recMissed" : "recNoAnswer", "neutral", null];
}

const TRIP_STATUSES = ["confirmed", "completed", "cancelled_by_skipper", "cancelled_by_client"];

function CaseDetail({ bookingId }) {
  const t = useTranslations("AdminReplacements");
  const f = useFormat();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminReplacementCaseDetail(bookingId)
      .then(setDetail)
      .catch((err) => setError(friendlyError(err)));
  }, [bookingId]);

  if (error) return <p style={{ color: colors.danger, fontSize: 13, padding: "12px 16px" }}>{error}</p>;
  if (!detail) return <Empty>{t("loading")}</Empty>;

  const fee = Number(detail.client_fee || 0);
  const refunded = Number(detail.client_refunded || 0);

  return (
    <div style={{ padding: "4px 16px 16px" }}>
      <div style={{ ...muted, fontSize: 12.5, margin: "8px 0 12px", lineHeight: 1.6 }}>
        {t.rich("clientLine", { name: detail.client_name, b: (c) => <b style={{ color: colors.ink, fontWeight: 500 }}>{c}</b> })}
        {fee > 0 && (
          <>
            {" · "}{t.rich("used", { credits: formatCredits(fee), m: (c) => <span style={money}>{c}</span> })}
            {refunded > 0 ? (
              <>
                , {t.rich("refunded", { count: refunded, credits: formatCredits(refunded), m: (c) => <span style={money}>{c}</span> })}
              </>
            ) : detail.new_booking ? (
              ` — ${t("coveredReplacement")}`
            ) : (
              ` — ${t("notRefunded")}`
            )}
          </>
        )}
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".04em", color: colors.inkSoft, margin: "0 0 6px" }}>
        {t("tripHistory")}
      </div>
      <div style={{ border: `1px solid ${colors.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
        {detail.trip.map((b, i) => (
          <div
            key={b.id}
            style={{ padding: "8px 12px", borderTop: i ? `1px solid ${colors.border}` : "none", fontSize: 13, lineHeight: 1.55 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span>
                {i === 0 ? t("originalBooking") : t("replacement")}: <b style={{ fontWeight: 600 }}>{b.skipper_name}</b>
              </span>
              <span style={badge(b.status === "cancelled_by_skipper" ? "warn" : b.status === "confirmed" ? "success" : "neutral")}>
                {TRIP_STATUSES.includes(b.status) ? t(`trip_${b.status}`) : b.status}
              </span>
            </div>
            <div style={{ ...muted, fontSize: 12 }}>
              {b.confirmed_at && <>{t("confirmedAt", { date: f.dateTime(b.confirmed_at) })}</>}
              {b.charged != null && (
                <>
                  {" · "}{t.rich("charged", { credits: formatCredits(b.charged), m: (c) => <span style={money}>{c}</span> })}
                </>
              )}
              {b.cancelled_at && (
                <>
                  {" · "}{t("cancelledAt", { date: f.dateTime(b.cancelled_at) })}
                  {b.cancellation_reason && <> — «{b.cancellation_reason}»</>}
                </>
              )}
              {b.replacement_closed_at && (
                <>
                  {" · "}{t("caseClosedAt", { date: f.dateTime(b.replacement_closed_at) })}
                  {b.replacement_closed_reason && <> — «{b.replacement_closed_reason}»</>}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".04em", color: colors.inkSoft, margin: "0 0 6px" }}>
        {t("offersHeading")}
      </div>
      {detail.offers.length === 0 && <Empty>{t("noOffers")}</Empty>}

      {detail.offers.map((o) => (
        <div key={o.id} style={{ marginBottom: 14, border: `1px solid ${colors.border}`, borderRadius: 10, overflow: "hidden" }}>
          <div
            style={{
              padding: "8px 12px",
              background: colors.bg,
              fontSize: 12.5,
              ...muted,
              display: "flex",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            <span>
              {t("sentAt", { date: f.dateTime(o.created_at) })}
              {o.created_by_name && <> {t("sentBy", { name: o.created_by_name })}</>} {t("toPeople", { count: o.recipients?.length || 0 })} · {t("answersBy", { date: f.dateTime(o.expires_at) })}
              {o.client_decide_by && <> · {t("clientDecidesBy", { date: f.dateTime(o.client_decide_by) })}</>}
              {o.closed_reason && OFFER_CLOSED.includes(o.closed_reason) && <> · {t(`offerClosed_${o.closed_reason}`)}</>}
              {o.note && <> · «{o.note}»</>}
            </span>
            <Status value={o.status} />
          </div>
          {(o.recipients || []).map((r) => {
            const [label, tone, at] = recipientState(r);
            return (
              <div
                key={r.skipper_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  borderTop: `1px solid ${colors.border}`,
                  fontSize: 13,
                  flexWrap: "wrap",
                }}
              >
                <span>{r.name}</span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {at && <span style={{ ...muted, fontSize: 12 }}>{f.dateTime(at)}</span>}
                  <span style={badge(tone)}>{t(label)}</span>
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function CaseRow({ c, expanded, onToggle, children, rightMeta }) {
  const t = useTranslations("AdminReplacements");
  const f = useFormat();
  return (
    <>
      <Row tone={expanded ? undefined : c.stage === "needs_action" ? "attention" : undefined} onClick={onToggle}>
        <RowMain
          title={`${c.port_name || "—"} · ${c.client_name || t("clientFallback")}`}
          meta={
            <>
              <span style={money}>{f.date(c.start_date)}</span> → <span style={money}>{f.date(c.end_date)}</span> ·{" "}
              {labelForRole(c.crew_role)} · {t("cancelledBy", { name: c.cancelled_skipper_name || "—" })}
              {c.skipper_cancellations > 1 && <> ({t("nthCancellation", { n: c.skipper_cancellations })})</>}
              {rightMeta}
            </>
          }
        />
        <span style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <span style={badge(STAGE_TONE[c.stage] || "neutral")}>{STAGE_TONE[c.stage] ? t(`stage_${c.stage}`) : c.stage}</span>
          <span style={{ ...muted, fontSize: 16 }}>{expanded ? "⌄" : "›"}</span>
        </span>
      </Row>
      {expanded && <div style={{ borderBottom: `1px solid ${colors.border}` }}>{children}</div>}
    </>
  );
}

function CloseCase({ c, onClosed, confirm }) {
  const t = useTranslations("AdminReplacements");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function close() {
    if (
      !(await confirm(
        t("confirmClose"),
        { tone: "danger", confirmLabel: t("confirmCloseYes") }
      ))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await adminCloseReplacementCase(c.booking_id, reason);
      onClosed();
    } catch (err) {
      setError(message(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: "12px 16px", borderTop: `1px solid ${colors.border}`, background: colors.bg }}>
      <div style={{ ...muted, fontSize: 12.5, marginBottom: 6 }}>
        {t("closeHint")}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          style={{
            flex: "1 1 220px",
            padding: "7px 10px",
            fontSize: 13,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            fontFamily: "inherit",
          }}
          placeholder={t("closeReason")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button style={{ ...button("secondary"), padding: "6px 12px", fontSize: 12.5 }} disabled={busy} onClick={close}>
          {busy ? "…" : t("closeWithout")}
        </button>
      </div>
      {error && <p style={{ color: colors.danger, fontSize: 12.5, margin: "6px 0 0" }}>{error}</p>}
    </div>
  );
}

export default function ReplacementsPage() {
  const t = useTranslations("AdminReplacements");
  const f = useFormat();
  const refreshCounts = useRefreshAdminCounts();
  const [confirm, confirmDialog] = useConfirm();
  const [cases, setCases] = useState([]);
  const [completed, setCompleted] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      setCases(await adminReplacementCases(false));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function loadCompleted(force = false) {
    if (completed !== null && !force) {
      setCompleted(null);
      return;
    }
    try {
      setCompleted((await adminReplacementCases(true)).filter((c) => c.stage === "completed" || c.stage === "closed_unfilled"));
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  function toggle(bookingId) {
    setExpandedId((cur) => (cur === bookingId ? null : bookingId));
  }

  function afterChange(msg) {
    setExpandedId(null);
    setNotice(msg || "");
    load();
    if (completed !== null) loadCompleted(true);
    refreshCounts();
  }

  async function withdraw(c) {
    const lose = c.offer_candidates > 0 ? ` ${t("withdrawLose", { count: c.offer_candidates })}` : "";
    if (!(await confirm(`${t("withdrawConfirm")}${lose}`, { tone: "danger", confirmLabel: t("withdraw") }))) return;
    setError("");
    try {
      await adminCancelOffer(c.offer_request_id);
      afterChange(t("withdrawn"));
    } catch (err) {
      setError(message(err, t));
    }
  }

  const needsAction = cases.filter((c) => c.stage === "needs_action");
  const awaitingSkippers = cases.filter((c) => c.stage === "awaiting_skippers");
  const awaitingClient = cases.filter((c) => c.stage === "awaiting_client");

  const withdrawBtn = (c) => (
    <button
      style={{ ...button("secondary"), padding: "5px 10px", fontSize: 12, marginBottom: 10 }}
      onClick={() => withdraw(c)}
    >
      {t("withdrawOffer")}
    </button>
  );

  return (
    <AdminShell
      title={t("title")}
      subtitle={t("subtitle")}
    >
      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}
      {notice && (
        <div
          style={{
            background: "#EAF2EE",
            border: `1px solid ${colors.success}`,
            borderRadius: 10,
            padding: "12px 14px",
            marginBottom: 14,
            fontSize: 13.5,
          }}
        >
          {notice}
        </div>
      )}

      <Panel title={t("needsActionTitle", { count: needsAction.length })} padded={false}>
        {busy && <Empty>{t("loading")}</Empty>}
        {!busy && needsAction.length === 0 && <Empty>{t("needsActionEmpty")}</Empty>}
        {needsAction.map((c) => (
          <CaseRow
            key={c.booking_id}
            c={c}
            expanded={expandedId === c.booking_id}
            onToggle={() => toggle(c.booking_id)}
            rightMeta={
              c.offer_request_id && OFFER_CLOSED.includes(c.offer_closed_reason) ? (
                <>
                  {" · "}
                  {t(`offerClosed_${c.offer_closed_reason}`)}
                </>
              ) : c.offer_request_id && c.offer_status === "open" ? (
                ` · ${t("offerExpired")}`
              ) : null
            }
          >
            <OfferComposer
              job={{
                booking_id: c.booking_id,
                crew_role: c.crew_role,
                start_date: c.start_date,
                end_date: c.end_date,
                port_id: c.port_id,
                region_id: c.region_id,
              }}
              onDone={afterChange}
            />
            <CloseCase c={c} confirm={confirm} onClosed={() => afterChange(t("caseClosedNotified"))} />
            <CaseDetail bookingId={c.booking_id} />
          </CaseRow>
        ))}
      </Panel>

      {awaitingSkippers.length > 0 && (
        <Panel title={t("awaitingSkippersTitle", { count: awaitingSkippers.length })} padded={false}>
          {awaitingSkippers.map((c) => (
            <CaseRow
              key={c.booking_id}
              c={c}
              expanded={expandedId === c.booking_id}
              onToggle={() => toggle(c.booking_id)}
              rightMeta={
                <>
                  {" · "}
                  {t.rich("pendingOf", { pending: c.offer_pending, total: c.offer_recipients, date: f.dateTime(c.offer_expires_at), m: (c) => <span style={money}>{c}</span> })}
                </>
              }
            >
              <div style={{ padding: "10px 16px 0" }}>{withdrawBtn(c)}</div>
              <CaseDetail bookingId={c.booking_id} />
            </CaseRow>
          ))}
        </Panel>
      )}

      {awaitingClient.length > 0 && (
        <Panel
          title={t("awaitingClientTitle", { count: awaitingClient.length })}
          subtitle={t("awaitingClientHint")}
          padded={false}
        >
          {awaitingClient.map((c) => (
            <CaseRow
              key={c.booking_id}
              c={c}
              expanded={expandedId === c.booking_id}
              onToggle={() => toggle(c.booking_id)}
              rightMeta={
                <>
                  {" · "}
                  {t.rich("candidates", { count: c.offer_candidates, m: (c) => <span style={money}>{c}</span> })}
                  {c.offer_client_decide_by && <> · {t("decidesBy", { date: f.dateTime(c.offer_client_decide_by) })}</>}
                </>
              }
            >
              <div style={{ padding: "10px 16px 0" }}>{withdrawBtn(c)}</div>
              <CaseDetail bookingId={c.booking_id} />
            </CaseRow>
          ))}
        </Panel>
      )}

      <Panel
        title={completed === null ? t("completedTitle") : t("completedTitleCount", { count: completed.length })}
        action={
          <button style={{ ...button("secondary"), padding: "5px 10px", fontSize: 12 }} onClick={() => loadCompleted()}>
            {completed === null ? t("showCompleted") : t("hide")}
          </button>
        }
        padded={false}
      >
        {completed === null && <Empty>{t("completedHidden")}</Empty>}
        {completed?.length === 0 && <Empty>{t("completedEmpty")}</Empty>}
        {completed?.map((c) => (
          <CaseRow
            key={c.booking_id}
            c={c}
            expanded={expandedId === c.booking_id}
            onToggle={() => toggle(c.booking_id)}
            rightMeta={
              c.stage === "completed" ? (
                <>
                  {" · "}{t.rich("newSkipper", { name: c.new_skipper_name, credits: formatCredits(c.charged), m: (c) => <span style={money}>{c}</span> })}
                  {c.confirmed_at && <> · {f.timeAgo(c.confirmed_at)}</>}
                </>
              ) : (
                <>
                  {" · "}
                  {c.replacement_closed_reason || t("withoutReplacement")}
                </>
              )
            }
          >
            <CaseDetail bookingId={c.booking_id} />
          </CaseRow>
        ))}
      </Panel>

      <p style={{ ...muted, fontSize: 12.5, lineHeight: 1.6 }}>
        {t("footnote")}
      </p>
      {confirmDialog}
    </AdminShell>
  );
}
