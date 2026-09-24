"use client";
import { useEffect, useState } from "react";
import AdminShell, { useAdminCounts, useRefreshAdminCounts } from "../AdminShell";
import OfferComposer from "../OfferComposer";
import { Panel, Row, RowMain, Empty, colors, muted, money, button } from "../ui";
import { labelForRole } from "../../../../lib/platform/roles";
import { adminCoverageNeeded, adminCancelOffer } from "../../../../lib/platform/db";
import { formatDate, formatDateRange } from "../../../../lib/platform/notifications";

export default function CoveragePage() {
  const refreshCounts = useRefreshAdminCounts();
  const counts = useAdminCounts();
  const [jobs, setJobs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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

  // Waiting on an answer is not the same as waiting on you, and mixing the two
  // is how a list of things to do stops being read.
  const waiting = jobs.filter((j) => !j.offer_request_id);
  const offered = jobs.filter((j) => j.offer_request_id);

  return (
    <AdminShell
      title="Κενά από ακυρώσεις"
      subtitle="Κρατήσεις που έμειναν χωρίς επαγγελματία. Ο πελάτης δεν επιλέγει αντικαταστάτη, τη δουλειά τη δίνεις εσύ."
      counts={counts}
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

      <Panel title={`Χρειάζονται ενέργεια (${waiting.length})`} padded={false}>
        {busy && <Empty>Φόρτωση…</Empty>}
        {!busy && waiting.length === 0 && <Empty>Καμία ακύρωση χωρίς κίνηση.</Empty>}
        {waiting.map((j) => (
          <Row
            key={j.booking_id}
            tone={selected?.booking_id === j.booking_id ? undefined : "attention"}
            onClick={() => setSelected(selected?.booking_id === j.booking_id ? null : j)}
          >
            <RowMain
              title={`${j.port_name || "—"} · ${j.client_name || "πελάτης"}`}
              meta={
                <>
                  <span style={money}>{formatDate(j.start_date)}</span> → <span style={money}>{formatDate(j.end_date)}</span> ·{" "}
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
          title={`Διαθέσιμοι ${formatDateRange(selected.start_date, selected.end_date)}`}
          subtitle={
            selected.port_name
              ? `${selected.port_name} · μόνο όσοι δηλώνουν αυτό το λιμάνι και είναι ελεύθεροι όλες τις ημέρες`
              : undefined
          }
          padded={false}
        >
          <OfferComposer
            job={selected}
            onDone={(msg) => {
              setSelected(null);
              setNotice(msg || "");
              load();
              refreshCounts();
            }}
          />
        </Panel>
      )}

      {offered.length > 0 && (
        <Panel
          title={`Στάλθηκαν και περιμένουν (${offered.length})`}
          subtitle="Η πρόταση είναι στον αέρα. Περιμένει απάντηση από τους επαγγελματίες."
          padded={false}
        >
          {offered.map((j) => (
            <Row key={j.booking_id}>
              <RowMain
                title={`${j.port_name || "—"} · ${j.client_name || "πελάτης"}`}
                meta={
                  <>
                    <span style={money}>{formatDate(j.start_date)}</span> → <span style={money}>{formatDate(j.end_date)}</span> ·{" "}
                    {labelForRole(j.crew_role)} · <span style={money}>{j.offer_pending}</span> δεν έχουν απαντήσει
                  </>
                }
              />
              <button
                style={{ ...button("secondary"), padding: "5px 10px", fontSize: 12, flexShrink: 0 }}
                onClick={() => withdraw(j.offer_request_id)}
              >
                Απόσυρση
              </button>
            </Row>
          ))}
        </Panel>
      )}

      <p style={{ ...muted, fontSize: 12.5, lineHeight: 1.6 }}>
        Δύο τρόποι, και οι δύο εδώ. Η <b style={{ fontWeight: 600 }}>πρόταση</b> φεύγει σε όσους διαλέξεις και την
        παίρνει όποιος αποδεχτεί πρώτος, πληρώνοντας το τέλος διεκδίκησης. Η{" "}
        <b style={{ fontWeight: 600 }}>άμεση ανάθεση</b> είναι για όταν το έχεις ήδη κλείσει στο τηλέφωνο: γράφει την
        κράτηση αμέσως, χωρίς αποδοχή και χωρίς χρέωση. Ο πελάτης δεν βλέπει λίστα σε καμία από τις δύο.
      </p>
    </AdminShell>
  );
}
