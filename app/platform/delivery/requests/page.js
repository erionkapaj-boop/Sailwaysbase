"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../../AuthContext";
import BackButton from "../../components/BackButton";
import { labelForRole } from "../../../../lib/platform/roles";
import { formatDate } from "../../../../lib/platform/notifications";
import { listMyDeliveryRequests, relistDeliveryRoleRequest, searchDeliveryCandidates } from "../../../../lib/platform/db";
import { container, card, h1, h2, muted, button, input, colors, money, badge, sectionLabel } from "../../../../lib/platform/theme";

const PING_LABEL = {
  pending: ["Αναμονή", colors.inkSoft],
  accepted: ["Αποδέχτηκε", colors.success || colors.accent],
  declined: ["Απέρριψε", colors.danger],
};

const ROLE_REQUEST_LABEL = {
  open: "Ανοιχτό",
  filled: "Καλύφθηκε",
  cancelled: "Ακυρώθηκε",
};

const RELIST_ERRORS = {
  not_open: "Αυτή η θέση δεν είναι πια ανοιχτή.",
  invalid_price: "Μη έγκυρη τιμή.",
  no_candidates_selected: "Επίλεξε τουλάχιστον έναν υποψήφιο.",
  invalid_candidate_selection: "Κάποιος από τους επιλεγμένους δεν είναι πλέον διαθέσιμος για μεταφορές.",
};

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
  const [price, setPrice] = useState(String(roleRequest.offered_price));
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
      setError("Συμπλήρωσε τιμή.");
      return;
    }
    if (selected.size === 0) {
      setError("Επίλεξε τουλάχιστον έναν υποψήφιο.");
      return;
    }
    setBusy(true);
    try {
      await relistDeliveryRoleRequest(roleRequest.id, Number(price), Array.from(selected));
      onDone();
    } catch (err) {
      setError(RELIST_ERRORS[err.message] || err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  const known = new Map((roleRequest.pings || []).map((p) => [p.skipper_id, p.status]));

  return (
    <div style={{ marginTop: 12, padding: "12px 14px", background: colors.bgSoft || "#F7F5F0", borderRadius: 10 }}>
      <label style={{ fontSize: 12.5, color: colors.inkSoft, display: "block", marginBottom: 4 }}>Νέα τιμή (€)</label>
      <input type="number" min={0} style={{ ...input, maxWidth: 160, marginBottom: 10 }} value={price} onChange={(e) => setPrice(e.target.value)} />

      {candidates == null && <p style={muted}>Φόρτωση...</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
        {candidates?.map((s) => (
          <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
            <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
            {s.nationality_country || "Υποψήφιος"}
            {known.has(s.id) && (
              <span style={{ fontSize: 12, color: PING_LABEL[known.get(s.id)]?.[1] }}>
                ({PING_LABEL[known.get(s.id)]?.[0]})
              </span>
            )}
          </label>
        ))}
      </div>

      {error && <p style={{ color: colors.danger, fontSize: 13, margin: "0 0 10px" }}>{error}</p>}
      <button style={{ ...button("primary"), padding: "7px 16px", fontSize: 13 }} disabled={busy} onClick={handleSubmit}>
        {busy ? "..." : "Αποστολή νέας τιμής"}
      </button>
    </div>
  );
}

function RoleRequestRow({ roleRequest, request, onChanged }) {
  const [relisting, setRelisting] = useState(false);
  const canRelist = roleRequest.status === "open";

  return (
    <div style={{ padding: "12px 0", borderTop: `1px solid ${colors.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontWeight: 600 }}>
          {labelForRole(roleRequest.crew_role)} · <span style={money}>{roleRequest.offered_price}€</span>
        </span>
        <span style={badge(roleRequest.status === "filled" ? "success" : roleRequest.status === "cancelled" ? "danger" : "neutral")}>
          {ROLE_REQUEST_LABEL[roleRequest.status] || roleRequest.status}
        </span>
      </div>

      {(roleRequest.pings || []).length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 10 }}>
          {roleRequest.pings.map((p) => (
            <span key={p.skipper_id} style={{ fontSize: 12.5, color: PING_LABEL[p.status]?.[1] || colors.inkSoft }}>
              {p.full_name || "Υποψήφιος"} — {PING_LABEL[p.status]?.[0] || p.status}
            </span>
          ))}
        </div>
      )}

      {roleRequest.booking && (
        <p style={{ ...muted, fontSize: 13, margin: "8px 0 0" }}>
          Ανέλαβε: <span style={{ ...money, color: colors.ink }}>{roleRequest.booking.status}</span>
        </p>
      )}

      {canRelist && (
        <div style={{ marginTop: 8 }}>
          {relisting ? (
            <RelistForm roleRequest={roleRequest} request={request} onDone={() => { setRelisting(false); onChanged(); }} />
          ) : (
            <button
              type="button"
              onClick={() => setRelisting(true)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: colors.accent, fontSize: 13 }}
            >
              Αύξηση τιμής &amp; νέα αποστολή →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function MyDeliveryRequestsPage() {
  const { session, loading } = useAuth();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      setRows(await listMyDeliveryRequests());
    } catch (err) {
      setError(err.message || String(err));
    }
  }
  useEffect(() => {
    if (session) load();
  }, [session]);

  if (loading) return <div style={container}>Φόρτωση...</div>;
  if (!session) return <div style={container}>Χρειάζεται σύνδεση.</div>;

  return (
    <div style={container}>
      <BackButton />
      <h1 style={{ ...h1, marginTop: 14 }}>Τα αιτήματα μεταφοράς μου</h1>
      {error && <p style={{ color: colors.danger }}>{error}</p>}
      {rows == null && <p style={muted}>Φόρτωση...</p>}
      {rows?.length === 0 && <p style={muted}>Δεν έχεις στείλει ακόμα αίτημα μεταφοράς.</p>}
      {rows?.map(({ request, role_requests }) => (
        <div key={request.id} style={card}>
          <h2 style={{ ...h2, fontSize: 16, margin: "0 0 4px" }}>
            {request.origin_point} → {request.destination_point}
          </h2>
          <p style={{ ...muted, fontSize: 13, margin: 0 }}>
            {request.distance_miles} μίλια · {formatDate(request.departure_date)}
            {request.flexible_days > 0 ? ` (±${request.flexible_days} μέρες)` : ""}
          </p>
          {(role_requests || []).map((rr) => (
            <RoleRequestRow key={rr.id} roleRequest={rr} request={request} onChanged={load} />
          ))}
        </div>
      ))}
    </div>
  );
}
