"use client";
import { useEffect, useState } from "react";
import AdminShell, { useAdminCounts } from "../AdminShell";
import OfferComposer from "../OfferComposer";
import { Panel, Row, RowMain, Empty, colors, muted, money, button } from "../ui";
import { labelForRole } from "../../../../lib/platform/roles";
import { adminCoverageNeeded, adminCancelOffer } from "../../../../lib/platform/db";
import { formatDate } from "../../../../lib/platform/notifications";

export default function CoveragePage() {
  const counts = useAdminCounts();
  const [jobs, setJobs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

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
      title="Κάλυψη"
      subtitle="Κρατήσεις που έμειναν χωρίς επαγγελματία. Ο πελάτης δεν επιλέγει αντικαταστάτη — τη δουλειά τη δίνεις εσύ."
      counts={counts}
    >
      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}

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
          title={`Διαθέσιμοι ${formatDate(selected.start_date)} → ${formatDate(selected.end_date)}`}
          subtitle={
            selected.port_name
              ? `${selected.port_name} · μόνο όσοι δηλώνουν αυτό το λιμάνι και είναι ελεύθεροι όλες τις ημέρες`
              : undefined
          }
          padded={false}
        >
          <OfferComposer
            job={selected}
            onDone={() => {
              setSelected(null);
              load();
            }}
          />
        </Panel>
      )}

      {offered.length > 0 && (
        <Panel
          title={`Στάλθηκαν και περιμένουν (${offered.length})`}
          subtitle="Η πρόταση είναι στον αέρα. Δεν χρειάζεσαι εσύ — χρειάζεται απάντηση."
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
