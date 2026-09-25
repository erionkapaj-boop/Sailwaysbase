"use client";
import { useCallback, useEffect, useState } from "react";
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
import { formatDate, formatDateTime, timeAgo } from "../../../../lib/platform/notifications";

// Ολόκληρη η διαδικασία αντικατάστασης, σε ένα μέρος — μία υπόθεση ανά
// ταξίδι: ακύρωση επαγγελματία → πρόταση σε υποψήφιους → όσοι δηλώσουν
// ενδιαφέρον → επιλογή πελάτη (24 ώρες) → νέα ανάθεση. Αν ακυρώσει και ο
// αντικαταστάτης, η ίδια υπόθεση συνεχίζει (δεν ανοίγει δεύτερη δίπλα).
const STAGE_LABEL = {
  needs_action: ["Χρειάζεται ενέργεια", "warn"],
  awaiting_skippers: ["Αναμονή απαντήσεων", "neutral"],
  awaiting_client: ["Αναμονή επιλογής πελάτη", "brand"],
  completed: ["Ολοκληρώθηκε", "success"],
  closed_unfilled: ["Έκλεισε χωρίς αντικαταστάτη", "neutral"],
};

const OFFER_CLOSED = {
  no_response: "Η προηγούμενη πρόταση έληξε χωρίς κανέναν ενδιαφερόμενο.",
  client_timeout: "Ο πελάτης δεν διάλεξε μέσα σε 24 ώρες — η προηγούμενη πρόταση έκλεισε.",
  withdrawn: "Απέσυρες την προηγούμενη πρόταση.",
  case_closed: "Η υπόθεση έκλεισε.",
};

const ERRORS = {
  case_closed: "Η υπόθεση έχει ήδη κλείσει.",
  not_latest_in_trip: "Το ταξίδι έχει ήδη νεότερη κράτηση.",
  not_awaiting_cover: "Αυτή η κράτηση δεν περιμένει κάλυψη.",
  request_not_open: "Η πρόταση δεν είναι πια ανοιχτή.",
};
function message(err) {
  const code = (err.message || "").match(/[a-z_]+/)?.[0];
  return ERRORS[code] || err.message || String(err);
}

function recipientState(r) {
  if (r.status === "claimed") return ["Επιλέχθηκε από τον πελάτη", "success", null];
  if (r.declined_at) return ["Απέρριψε", "neutral", r.declined_at];
  if (r.withdrawn_at) return ["Δήλωσε ενδιαφέρον, μετά αποσύρθηκε", "neutral", r.withdrawn_at];
  if (r.candidate_at)
    return r.status === "pending"
      ? ["Υποψήφιος — περιμένει τον πελάτη", "brand", r.candidate_at]
      : ["Δήλωσε ενδιαφέρον, δεν επιλέχθηκε", "neutral", r.candidate_at];
  return [r.status === "missed" ? "Δεν απάντησε" : "Δεν έχει απαντήσει ακόμα", "neutral", null];
}

const TRIP_STATUS = {
  confirmed: "Επιβεβαιωμένη",
  completed: "Ολοκληρώθηκε",
  cancelled_by_skipper: "Ακύρωσε ο επαγγελματίας",
  cancelled_by_client: "Ακύρωσε ο πελάτης",
};

function CaseDetail({ bookingId }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminReplacementCaseDetail(bookingId)
      .then(setDetail)
      .catch((err) => setError(err.message || String(err)));
  }, [bookingId]);

  if (error) return <p style={{ color: colors.danger, fontSize: 13, padding: "12px 16px" }}>{error}</p>;
  if (!detail) return <Empty>Φόρτωση…</Empty>;

  const fee = Number(detail.client_fee || 0);
  const refunded = Number(detail.client_refunded || 0);

  return (
    <div style={{ padding: "4px 16px 16px" }}>
      <div style={{ ...muted, fontSize: 12.5, margin: "8px 0 12px", lineHeight: 1.6 }}>
        Πελάτης: <b style={{ color: colors.ink, fontWeight: 500 }}>{detail.client_name}</b>
        {fee > 0 && (
          <>
            {" · "}πλήρωσε τέλος <span style={money}>{fee}€</span>
            {refunded > 0 ? (
              <>
                , επιστράφηκαν <span style={money}>{refunded}€</span>
              </>
            ) : detail.new_booking ? (
              " — κάλυψε και την αντικατάσταση, δεν ξαναπλήρωσε"
            ) : (
              " — δεν επιστρέφεται όσο ψάχνουμε αντικαταστάτη"
            )}
          </>
        )}
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".04em", color: colors.inkSoft, margin: "0 0 6px" }}>
        ΙΣΤΟΡΙΚΟ ΤΑΞΙΔΙΟΥ
      </div>
      <div style={{ border: `1px solid ${colors.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
        {detail.trip.map((b, i) => (
          <div
            key={b.id}
            style={{ padding: "8px 12px", borderTop: i ? `1px solid ${colors.border}` : "none", fontSize: 13, lineHeight: 1.55 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span>
                {i === 0 ? "Αρχική κράτηση" : "Αντικατάσταση"}: <b style={{ fontWeight: 600 }}>{b.skipper_name}</b>
              </span>
              <span style={badge(b.status === "cancelled_by_skipper" ? "warn" : b.status === "confirmed" ? "success" : "neutral")}>
                {TRIP_STATUS[b.status] || b.status}
              </span>
            </div>
            <div style={{ ...muted, fontSize: 12 }}>
              {b.confirmed_at && <>Επιβεβαιώθηκε {formatDateTime(b.confirmed_at)}</>}
              {b.charged != null && (
                <>
                  {" · "}χρεώθηκε <span style={money}>{b.charged}€</span>
                </>
              )}
              {b.cancelled_at && (
                <>
                  {" · "}ακύρωσε {formatDateTime(b.cancelled_at)}
                  {b.cancellation_reason && <> — «{b.cancellation_reason}»</>}
                </>
              )}
              {b.replacement_closed_at && (
                <>
                  {" · "}υπόθεση έκλεισε {formatDateTime(b.replacement_closed_at)}
                  {b.replacement_closed_reason && <> — «{b.replacement_closed_reason}»</>}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".04em", color: colors.inkSoft, margin: "0 0 6px" }}>
        ΠΡΟΤΑΣΕΙΣ ΑΝΤΙΚΑΤΑΣΤΑΣΗΣ
      </div>
      {detail.offers.length === 0 && <Empty>Καμία πρόταση δεν έχει σταλεί ακόμα.</Empty>}

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
              Στάλθηκε {formatDateTime(o.created_at)}
              {o.created_by_name && <> από {o.created_by_name}</>} σε {o.recipients?.length || 0} άτομα · απαντήσεις έως{" "}
              {formatDateTime(o.expires_at)}
              {o.client_decide_by && <> · ο πελάτης διαλέγει έως {formatDateTime(o.client_decide_by)}</>}
              {o.closed_reason && OFFER_CLOSED[o.closed_reason] && <> · {OFFER_CLOSED[o.closed_reason]}</>}
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
                  {at && <span style={{ ...muted, fontSize: 12 }}>{formatDateTime(at)}</span>}
                  <span style={badge(tone)}>{label}</span>
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
  return (
    <>
      <Row tone={expanded ? undefined : c.stage === "needs_action" ? "attention" : undefined} onClick={onToggle}>
        <RowMain
          title={`${c.port_name || "—"} · ${c.client_name || "πελάτης"}`}
          meta={
            <>
              <span style={money}>{formatDate(c.start_date)}</span> → <span style={money}>{formatDate(c.end_date)}</span> ·{" "}
              {labelForRole(c.crew_role)} · ακύρωσε {c.cancelled_skipper_name || "—"}
              {c.skipper_cancellations > 1 && <> ({c.skipper_cancellations}η ακύρωση στο ίδιο ταξίδι)</>}
              {rightMeta}
            </>
          }
        />
        <span style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <span style={badge(STAGE_LABEL[c.stage]?.[1] || "neutral")}>{STAGE_LABEL[c.stage]?.[0] || c.stage}</span>
          <span style={{ ...muted, fontSize: 16 }}>{expanded ? "⌄" : "›"}</span>
        </span>
      </Row>
      {expanded && <div style={{ borderBottom: `1px solid ${colors.border}` }}>{children}</div>}
    </>
  );
}

function CloseCase({ c, onClosed, confirm }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function close() {
    if (
      !(await confirm(
        "Κλείσιμο της υπόθεσης χωρίς αντικαταστάτη; Ο πελάτης παίρνει πίσω το τέλος που πλήρωσε και ειδοποιείται. Δεν αναιρείται.",
        { tone: "danger", confirmLabel: "Ναι, κλείσιμο" }
      ))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await adminCloseReplacementCase(c.booking_id, reason);
      onClosed();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: "12px 16px", borderTop: `1px solid ${colors.border}`, background: colors.bg }}>
      <div style={{ ...muted, fontSize: 12.5, marginBottom: 6 }}>
        Αν δεν μπορεί να βρεθεί αντικαταστάτης, κλείσε την υπόθεση — επιστρέφεται στον πελάτη το τέλος του.
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
          placeholder="Λόγος (π.χ. κανείς διαθέσιμος)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button style={{ ...button("secondary"), padding: "6px 12px", fontSize: 12.5 }} disabled={busy} onClick={close}>
          {busy ? "…" : "Κλείσιμο χωρίς αντικαταστάτη"}
        </button>
      </div>
      {error && <p style={{ color: colors.danger, fontSize: 12.5, margin: "6px 0 0" }}>{error}</p>}
    </div>
  );
}

export default function ReplacementsPage() {
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
      setError(err.message || String(err));
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
      setError(err.message || String(err));
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
    const lose =
      c.offer_candidates === 1
        ? " Ο υποψήφιος θα ενημερωθεί και ο πελάτης δεν θα τον βλέπει πια."
        : c.offer_candidates > 1
          ? ` Οι ${c.offer_candidates} υποψήφιοι θα ενημερωθούν και ο πελάτης δεν θα τους βλέπει πια.`
          : "";
    if (!(await confirm(`Απόσυρση της πρότασης;${lose}`, { tone: "danger", confirmLabel: "Απόσυρση" }))) return;
    setError("");
    try {
      await adminCancelOffer(c.offer_request_id);
      afterChange("Η πρόταση αποσύρθηκε. Μπορείς να στείλεις νέα.");
    } catch (err) {
      setError(message(err));
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
      Απόσυρση πρότασης
    </button>
  );

  return (
    <AdminShell
      title="Αντικαταστάσεις"
      subtitle="Ένας επαγγελματίας ακύρωσε επιβεβαιωμένη κράτηση. Στέλνεις πρόταση σε υποψήφιους· ο πελάτης διαλέγει ο ίδιος ανάμεσα σε όσους δηλώσουν ενδιαφέρον, μέσα σε 24 ώρες."
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

      <Panel title={`Χρειάζονται ενέργεια (${needsAction.length})`} padded={false}>
        {busy && <Empty>Φόρτωση…</Empty>}
        {!busy && needsAction.length === 0 && <Empty>Καμία υπόθεση δεν περιμένει εσένα.</Empty>}
        {needsAction.map((c) => (
          <CaseRow
            key={c.booking_id}
            c={c}
            expanded={expandedId === c.booking_id}
            onToggle={() => toggle(c.booking_id)}
            rightMeta={
              c.offer_request_id && OFFER_CLOSED[c.offer_closed_reason] ? (
                <>
                  {" · "}
                  {OFFER_CLOSED[c.offer_closed_reason]}
                </>
              ) : c.offer_request_id && c.offer_status === "open" ? (
                " · η πρόταση έληξε"
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
            <CloseCase c={c} confirm={confirm} onClosed={() => afterChange("Η υπόθεση έκλεισε και ο πελάτης ειδοποιήθηκε.")} />
            <CaseDetail bookingId={c.booking_id} />
          </CaseRow>
        ))}
      </Panel>

      {awaitingSkippers.length > 0 && (
        <Panel title={`Αναμονή απαντήσεων skippers (${awaitingSkippers.length})`} padded={false}>
          {awaitingSkippers.map((c) => (
            <CaseRow
              key={c.booking_id}
              c={c}
              expanded={expandedId === c.booking_id}
              onToggle={() => toggle(c.booking_id)}
              rightMeta={
                <>
                  {" · "}
                  <span style={money}>{c.offer_pending}</span> από <span style={money}>{c.offer_recipients}</span> δεν έχουν
                  απαντήσει · έως {formatDateTime(c.offer_expires_at)}
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
          title={`Αναμονή επιλογής πελάτη (${awaitingClient.length})`}
          subtitle="Υπάρχουν υποψήφιοι — ο πελάτης τους βλέπει στην κράτησή του και έχει 24 ώρες να διαλέξει."
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
                  <span style={money}>{c.offer_candidates}</span> {c.offer_candidates === 1 ? "υποψήφιος" : "υποψήφιοι"}
                  {c.offer_client_decide_by && <> · διαλέγει έως {formatDateTime(c.offer_client_decide_by)}</>}
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
        title={completed === null ? "Ολοκληρωμένες υποθέσεις" : `Ολοκληρωμένες υποθέσεις (${completed.length})`}
        action={
          <button style={{ ...button("secondary"), padding: "5px 10px", fontSize: 12 }} onClick={() => loadCompleted()}>
            {completed === null ? "Δες τις ολοκληρωμένες" : "Απόκρυψη"}
          </button>
        }
        padded={false}
      >
        {completed === null && <Empty>Κρυφές — πάτα «Δες τις ολοκληρωμένες».</Empty>}
        {completed?.length === 0 && <Empty>Καμία ακόμα.</Empty>}
        {completed?.map((c) => (
          <CaseRow
            key={c.booking_id}
            c={c}
            expanded={expandedId === c.booking_id}
            onToggle={() => toggle(c.booking_id)}
            rightMeta={
              c.stage === "completed" ? (
                <>
                  {" · "}νέος: {c.new_skipper_name} · <span style={money}>{c.charged}€</span>
                  {c.confirmed_at && <> · {timeAgo(c.confirmed_at)}</>}
                </>
              ) : (
                <>
                  {" · "}
                  {c.replacement_closed_reason || "χωρίς αντικαταστάτη"}
                </>
              )
            }
          >
            <CaseDetail bookingId={c.booking_id} />
          </CaseRow>
        ))}
      </Panel>

      <p style={{ ...muted, fontSize: 12.5, lineHeight: 1.6 }}>
        Ο πελάτης βλέπει τους υποψήφιους ανώνυμα (ίδια στοιχεία με την αναζήτηση) και διαλέγει μόνος του μέσα σε 24 ώρες
        από τον πρώτο. Χρεώνεται μόνο ο επαγγελματίας που θα επιλεγεί, τη στιγμή της επιλογής. Ο πελάτης δεν πληρώνει
        ξανά· το τέλος του επιστρέφεται μόνο αν η υπόθεση κλείσει χωρίς αντικαταστάτη.
      </p>
      {confirmDialog}
    </AdminShell>
  );
}
