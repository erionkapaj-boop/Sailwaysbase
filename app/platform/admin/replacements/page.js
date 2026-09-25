"use client";
import { useCallback, useEffect, useState } from "react";
import AdminShell, { useAdminCounts, useRefreshAdminCounts } from "../AdminShell";
import OfferComposer from "../OfferComposer";
import { Panel, Row, RowMain, Empty, Status, colors, muted, money, button } from "../ui";
import { badge } from "../../../../lib/platform/theme";
import { labelForRole } from "../../../../lib/platform/roles";
import { adminReplacementCases, adminReplacementCaseDetail, adminCancelOffer } from "../../../../lib/platform/db";
import { formatDate, formatDateTime, timeAgo } from "../../../../lib/platform/notifications";

// Ολόκληρη η διαδικασία αντικατάστασης, σε ένα μέρος: ακύρωση επαγγελματία →
// πρόταση σε υποψήφιους → όσοι δηλώνουν ενδιαφέρον → επιλογή πελάτη → νέα
// ανάθεση. Ο πελάτης διαλέγει πλέον ο ίδιος (δεν αναθέτει ο admin απευθείας)
// — βλ. OfferComposer, όπου αφαιρέθηκε η «Άμεση ανάθεση» ακριβώς γι' αυτό.
const STAGE_LABEL = {
  needs_action: ["Χρειάζεται ενέργεια", "warn"],
  awaiting_skippers: ["Αναμονή απαντήσεων", "neutral"],
  awaiting_client: ["Έτοιμο για τον πελάτη", "brand"],
  completed: ["Ολοκληρώθηκε", "success"],
};

function RECIPIENT_LABEL(r) {
  if (r.status === "claimed") return ["Επιλέχθηκε", "success"];
  if (r.declined_at) return ["Απέρριψε", "neutral"];
  if (r.candidate_at) return [r.status === "missed" ? "Δήλωσε ενδιαφέρον, δεν επιλέχθηκε" : "Υποψήφιος — περιμένει τον πελάτη", r.status === "pending" ? "brand" : "neutral"];
  return [r.status === "missed" ? "Δεν απάντησε" : "Δεν έχει απαντήσει ακόμα", "neutral"];
}

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

  return (
    <div style={{ padding: "4px 16px 16px" }}>
      <p style={{ ...muted, fontSize: 12.5, margin: "8px 0 14px" }}>
        Ακύρωσε ο αρχικός επαγγελματίας {formatDateTime(detail.booking.cancelled_at)}
        {detail.booking.cancellation_reason && <> · «{detail.booking.cancellation_reason}»</>}
      </p>

      {detail.new_booking && (
        <div style={{ ...badge("success"), display: "block", padding: "8px 12px", marginBottom: 14, fontWeight: 400 }}>
          Νέα ανάθεση: <b style={{ fontWeight: 600 }}>{detail.new_booking.skipper_name}</b>, χρεώθηκε{" "}
          <span style={money}>{detail.new_booking.charged}€</span> στις {formatDateTime(detail.new_booking.confirmed_at)}
        </div>
      )}

      {detail.offers.length === 0 && <Empty>Καμία πρόταση δεν έχει σταλεί ακόμα.</Empty>}

      {detail.offers.map((o) => (
        <div key={o.id} style={{ marginBottom: 16, border: `1px solid ${colors.border}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", background: colors.bg, fontSize: 12.5, ...muted, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
            <span>
              Στάλθηκε {formatDateTime(o.created_at)} σε {o.recipients?.length || 0} άτομα
              {o.note && <> · «{o.note}»</>}
            </span>
            <Status value={o.status} />
          </div>
          {(o.recipients || []).map((r) => {
            const [label, tone] = RECIPIENT_LABEL(r);
            return (
              <div key={r.skipper_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: `1px solid ${colors.border}`, fontSize: 13 }}>
                <span>{r.name}</span>
                <span style={badge(tone)}>{label}</span>
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
              {labelForRole(c.crew_role)}
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

export default function ReplacementsPage() {
  const refreshCounts = useRefreshAdminCounts();
  const counts = useAdminCounts();
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

  async function loadCompleted() {
    if (completed !== null) {
      setCompleted(null);
      return;
    }
    try {
      setCompleted((await adminReplacementCases(true)).filter((c) => c.stage === "completed"));
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  function toggle(bookingId) {
    setExpandedId((cur) => (cur === bookingId ? null : bookingId));
  }

  async function withdraw(requestId) {
    setError("");
    try {
      await adminCancelOffer(requestId);
      await load();
      refreshCounts();
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  const needsAction = cases.filter((c) => c.stage === "needs_action");
  const awaitingSkippers = cases.filter((c) => c.stage === "awaiting_skippers");
  const awaitingClient = cases.filter((c) => c.stage === "awaiting_client");

  return (
    <AdminShell
      title="Αντικαταστάσεις"
      subtitle="Ένας επαγγελματίας ακύρωσε επιβεβαιωμένη κράτηση. Στέλνεις πρόταση σε υποψήφιους· ο πελάτης διαλέγει ο ίδιος ανάμεσα σε όσους δηλώσουν ενδιαφέρον."
      counts={counts}
    >
      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}
      {notice && (
        <div style={{ background: "#EAF2EE", border: `1px solid ${colors.success}`, borderRadius: 10, padding: "12px 14px", marginBottom: 14, fontSize: 13.5 }}>
          {notice}
        </div>
      )}

      <Panel title={`Χρειάζονται ενέργεια (${needsAction.length})`} padded={false}>
        {busy && <Empty>Φόρτωση…</Empty>}
        {!busy && needsAction.length === 0 && <Empty>Καμία ακύρωση χωρίς κίνηση.</Empty>}
        {needsAction.map((c) => (
          <CaseRow key={c.booking_id} c={c} expanded={expandedId === c.booking_id} onToggle={() => toggle(c.booking_id)}>
            <OfferComposer
              job={{ booking_id: c.booking_id, crew_role: c.crew_role, start_date: c.start_date, end_date: c.end_date, port_id: c.port_id }}
              onDone={(msg) => {
                setExpandedId(null);
                setNotice(msg || "");
                load();
                refreshCounts();
              }}
            />
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
                  <span style={money}>{c.offer_pending}</span> από <span style={money}>{c.offer_recipients}</span> δεν έχουν απαντήσει
                </>
              }
            >
              <div style={{ padding: "10px 16px" }}>
                <button style={{ ...button("secondary"), padding: "5px 10px", fontSize: 12, marginBottom: 10 }} onClick={() => withdraw(c.offer_request_id)}>
                  Απόσυρση πρότασης
                </button>
                <CaseDetail bookingId={c.booking_id} />
              </div>
            </CaseRow>
          ))}
        </Panel>
      )}

      {awaitingClient.length > 0 && (
        <Panel
          title={`Έτοιμο για τον πελάτη (${awaitingClient.length})`}
          subtitle="Υπάρχουν υποψήφιοι — ο πελάτης το βλέπει ήδη στην κράτησή του και μπορεί να διαλέξει."
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
                </>
              }
            >
              <div style={{ padding: "10px 16px" }}>
                <button style={{ ...button("secondary"), padding: "5px 10px", fontSize: 12, marginBottom: 10 }} onClick={() => withdraw(c.offer_request_id)}>
                  Απόσυρση πρότασης
                </button>
                <CaseDetail bookingId={c.booking_id} />
              </div>
            </CaseRow>
          ))}
        </Panel>
      )}

      <Panel
        title={completed === null ? "Ολοκληρωμένες αντικαταστάσεις" : `Ολοκληρωμένες (${completed.length})`}
        action={
          <button style={{ ...button("secondary"), padding: "5px 10px", fontSize: 12 }} onClick={loadCompleted}>
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
              <>
                {" · "}
                {c.new_skipper_name} · <span style={money}>{c.charged}€</span>
                {c.confirmed_at && <> · {timeAgo(c.confirmed_at)}</>}
              </>
            }
          >
            <CaseDetail bookingId={c.booking_id} />
          </CaseRow>
        ))}
      </Panel>

      <p style={{ ...muted, fontSize: 12.5, lineHeight: 1.6 }}>
        Ο πελάτης βλέπει τους υποψήφιους ανώνυμα (ίδια στοιχεία με την αναζήτηση) στην κράτησή του και διαλέγει μόνος
        του. Η χρέωση γίνεται τη στιγμή που διαλέγει, όχι όταν ο επαγγελματίας δηλώνει ενδιαφέρον.
      </p>
    </AdminShell>
  );
}
