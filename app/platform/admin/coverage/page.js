"use client";
import { useEffect, useState } from "react";
import AdminShell, { useAdminCounts } from "../AdminShell";
import { Panel, Toolbar, Row, RowMain, Empty, colors, muted, money, button } from "../ui";
import { CREW_ROLES, labelForRole } from "../../../../lib/platform/roles";
import {
  adminCoverageNeeded,
  adminSearchAvailability,
  adminAssignReplacement,
} from "../../../../lib/platform/db";

const inputStyle = {
  padding: "8px 11px",
  fontSize: 14,
  fontFamily: "inherit",
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  background: colors.card,
  color: colors.ink,
  boxSizing: "border-box",
};

const ASSIGN_ERRORS = {
  already_covered: "Έχει ήδη ανατεθεί σε κάποιον άλλον.",
  skipper_already_booked: "Ο επαγγελματίας έχει ήδη κράτηση σε αυτές τις ημερομηνίες.",
  skipper_not_eligible: "Το προφίλ του δεν είναι εγκεκριμένο.",
  cannot_hire_self: "Ο πελάτης και ο επαγγελματίας είναι το ίδιο πρόσωπο.",
  not_awaiting_cover: "Αυτή η κράτηση δεν περιμένει κάλυψη.",
};

// Availability search stands on its own as well as serving a cancellation:
// "who is free that week" is a question an operator has anyway.
function AvailabilitySearch({ job, onAssigned }) {
  const [role, setRole] = useState(job?.crew_role || "skipper");
  const [startDate, setStartDate] = useState(job?.start_date || "");
  const [endDate, setEndDate] = useState(job?.end_date || "");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [assigningId, setAssigningId] = useState(null);
  const [error, setError] = useState("");

  async function search(e) {
    e?.preventDefault();
    if (!startDate || !endDate) return;
    setBusy(true);
    setError("");
    try {
      setResults(
        await adminSearchAvailability({
          role,
          startDate,
          endDate,
          portId: job?.port_id || null,
        })
      );
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (job?.start_date && job?.end_date) search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.booking_id]);

  async function assign(skipperId) {
    setAssigningId(skipperId);
    setError("");
    try {
      await adminAssignReplacement(job.booking_id, skipperId);
      onAssigned?.();
    } catch (err) {
      const code = (err.message || "").match(/[a-z_]+/)?.[0];
      setError(ASSIGN_ERRORS[code] || err.message || String(err));
    } finally {
      setAssigningId(null);
    }
  }

  return (
    <>
      <Toolbar>
        <form onSubmit={search} style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
          <select style={{ ...inputStyle, flex: "1 1 140px" }} value={role} onChange={(e) => setRole(e.target.value)}>
            {CREW_ROLES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            style={{ ...inputStyle, flex: "1 1 140px" }}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <input
            type="date"
            style={{ ...inputStyle, flex: "1 1 140px" }}
            min={startDate || undefined}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <button type="submit" style={button("secondary")} disabled={busy}>
            {busy ? "…" : "Αναζήτηση"}
          </button>
        </form>
      </Toolbar>

      {error && <p style={{ color: colors.danger, fontSize: 13, padding: "10px 16px", margin: 0 }}>{error}</p>}
      {results === null && <Empty>Διάλεξε ιδιότητα και ημερομηνίες.</Empty>}
      {results?.length === 0 && (
        <Empty>Κανένας διαθέσιμος για αυτές τις ημερομηνίες{job?.port_name ? ` στο ${job.port_name}` : ""}.</Empty>
      )}

      {results?.map((s) => (
        <Row key={s.skipper_id}>
          <RowMain
            title={s.full_name || "(χωρίς όνομα)"}
            meta={
              <>
                <span style={money}>{s.phone_number}</span> · <span style={money}>{s.price_per_day}€</span>/ημέρα ·{" "}
                {s.rating_count > 0 ? (
                  <>
                    <span style={money}>{Number(s.rating_avg).toFixed(1)}</span>★ (
                    <span style={money}>{s.rating_count}</span>)
                  </>
                ) : (
                  "χωρίς αξιολογήσεις"
                )}
                {s.reliability_percentage != null && (
                  <>
                    {" · "}
                    <span style={money}>{s.reliability_percentage}%</span> αξιοπιστία
                  </>
                )}
              </>
            }
          />
          {job && (
            <button
              style={button("primary")}
              disabled={assigningId === s.skipper_id}
              onClick={() => assign(s.skipper_id)}
            >
              {assigningId === s.skipper_id ? "…" : "Ανάθεση"}
            </button>
          )}
        </Row>
      ))}
    </>
  );
}

export default function CoveragePage() {
  const counts = useAdminCounts();
  const [jobs, setJobs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(true);

  async function load() {
    try {
      const rows = await adminCoverageNeeded();
      setJobs(rows);
      setSelected((cur) => rows.find((r) => r.booking_id === cur?.booking_id) || null);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  return (
    <AdminShell
      title="Κάλυψη"
      subtitle="Κρατήσεις που έμειναν χωρίς επαγγελματία. Ο πελάτης δεν επιλέγει αντικαταστάτη — τον αναθέτεις εσύ."
      counts={counts}
    >
      <Panel title={`Περιμένουν κάλυψη (${jobs.length})`} padded={false}>
        {busy && <Empty>Φόρτωση…</Empty>}
        {!busy && jobs.length === 0 && <Empty>Καμία κράτηση χωρίς επαγγελματία.</Empty>}
        {jobs.map((j) => (
          <Row
            key={j.booking_id}
            tone={selected?.booking_id === j.booking_id ? undefined : "attention"}
            onClick={() => setSelected(selected?.booking_id === j.booking_id ? null : j)}
          >
            <RowMain
              title={`${j.port_name || "—"} · ${j.client_name || "πελάτης"}`}
              meta={
                <>
                  <span style={money}>{j.start_date}</span> → <span style={money}>{j.end_date}</span> ·{" "}
                  {labelForRole(j.crew_role)}
                  {j.cancellation_reason ? ` · «${j.cancellation_reason}»` : ""}
                </>
              }
            />
            <span style={{ ...muted, fontSize: 18, flexShrink: 0 }}>
              {selected?.booking_id === j.booking_id ? "⌄" : "›"}
            </span>
          </Row>
        ))}
      </Panel>

      {selected && (
        <Panel
          title={`Διαθέσιμοι για ${selected.start_date} → ${selected.end_date}`}
          subtitle={
            selected.port_name
              ? `${selected.port_name} · φιλτραρισμένοι σε όσους δηλώνουν αυτό το λιμάνι`
              : undefined
          }
          padded={false}
        >
          <AvailabilitySearch
            job={selected}
            onAssigned={() => {
              setSelected(null);
              load();
            }}
          />
        </Panel>
      )}

      <Panel
        title="Ελεύθερη αναζήτηση διαθεσιμότητας"
        subtitle="Ποιοι είναι ελεύθεροι σε μια περίοδο, ανεξάρτητα από ακύρωση."
        padded={false}
      >
        <AvailabilitySearch />
      </Panel>
    </AdminShell>
  );
}
