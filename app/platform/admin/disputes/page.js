"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AdminShell, { useRefreshAdminCounts } from "../AdminShell";
import { Panel, Row, RowMain, Empty, colors, muted, money, button } from "../ui";
import { tapTarget } from "../../../../lib/platform/theme";
import { adminListCancellationReports, adminResolveReport, departureLabel } from "../../../../lib/platform/db";
import { timeAgo, formatDate } from "../../../../lib/platform/notifications";

function People({ people }) {
  if (!people?.client && !people?.pro) return null;
  const item = (label, p) =>
    p && (
      <Link href={`/platform/admin/user/${p.id}`} style={{ ...tapTarget, color: colors.ink, textDecoration: "underline" }}>
        {label}: {p.name || "(χωρίς όνομα)"}
      </Link>
    );
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13, marginTop: 8 }}>
      {item("Πελάτης", people.client)}
      {item("Επαγγελματίας", people.pro)}
    </div>
  );
}

export default function DisputesPage() {
  const refreshCounts = useRefreshAdminCounts();
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [notes, setNotes] = useState({});
  const [error, setError] = useState("");

  async function load() {
    try {
      setList(await adminListCancellationReports());
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function resolve(id) {
    setBusyId(id);
    setError("");
    try {
      await adminResolveReport(id, notes[id] || null);
      await load();
      refreshCounts();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusyId(null);
    }
  }

  const open = list.filter((r) => !r.resolved_at);
  const done = list.filter((r) => r.resolved_at);

  return (
    <AdminShell
      title="Αναφορές ακύρωσης"
      subtitle="Όταν ακυρώνεται μια κράτηση, η άλλη πλευρά μπορεί να το αναφέρει. Η ακύρωση έχει ήδη μετρήσει στην αξιοπιστία. Το «Κλείσιμο» σημαίνει ότι το είδες, δεν την αναιρεί."
    >
      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}

      <Panel title={`Ανοιχτές (${open.length})`} padded={false}>
        {busy && <Empty>Φόρτωση…</Empty>}
        {!busy && open.length === 0 && <Empty>Καμία ανοιχτή αναφορά.</Empty>}
        {open.map((r) => (
          <div key={r.id} style={{ borderBottom: `1px solid ${colors.border}`, padding: "14px 16px", background: "#FBF6EC" }}>
            <RowMain
              title={
                r.bookings
                  ? `${departureLabel(r.bookings)} · ${formatDate(r.bookings.start_date)} → ${formatDate(r.bookings.end_date)}`
                  : "Κράτηση"
              }
              meta={`Ακύρωσε ${r.at_fault_party === "client" ? "ο πελάτης" : "ο επαγγελματίας"} · αναφέρθηκε ${timeAgo(r.created_at)}`}
            />
            <People people={r.people} />
            <p style={{ fontSize: 13, margin: "10px 0 0", color: colors.ink }}>{r.reason}</p>
            <input
              placeholder="Τι έγινε / τι αποφάσισες (προαιρετικό)"
              value={notes[r.id] || ""}
              onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
              style={{
                width: "100%",
                marginTop: 10,
                padding: "8px 10px",
                fontSize: 13,
                fontFamily: "inherit",
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                boxSizing: "border-box",
                background: colors.card,
                color: colors.ink,
              }}
            />
            <button
              style={{ ...button("primary"), marginTop: 10 }}
              disabled={busyId === r.id}
              onClick={() => resolve(r.id)}
            >
              {busyId === r.id ? "…" : "Κλείσιμο αναφοράς"}
            </button>
          </div>
        ))}
      </Panel>

      <Panel title={`Επιλυμένες (${done.length})`} padded={false}>
        {done.length === 0 && <Empty>Καμία ακόμα.</Empty>}
        {done.map((r) => (
          <Row key={r.id}>
            <RowMain
              title={`${r.bookings ? departureLabel(r.bookings) : "Κράτηση"} · ${[r.people?.client?.name, r.people?.pro?.name].filter(Boolean).join(" ↔ ")}`}
              meta={r.resolution_note || r.reason}
            />
            <span style={{ ...muted, fontSize: 11.5, flexShrink: 0 }}>{timeAgo(r.resolved_at)}</span>
          </Row>
        ))}
      </Panel>
    </AdminShell>
  );
}
