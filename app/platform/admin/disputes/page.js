"use client";
import { useEffect, useState } from "react";
import AdminShell, { useAdminCounts } from "../AdminShell";
import { Panel, Row, RowMain, Empty, colors, muted, money, button } from "../ui";
import { adminListCancellationReports, adminResolveReport, departureLabel } from "../../../../lib/platform/db";
import { timeAgo } from "../../../../lib/platform/notifications";

export default function DisputesPage() {
  const counts = useAdminCounts();
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
      title="Διαφορές"
      subtitle="Αναφορές ακύρωσης. Κάθε μία έχει ήδη επηρεάσει την αξιοπιστία κάποιου — η επίλυση την κλείνει, δεν την αναιρεί."
      counts={counts}
    >
      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}

      <Panel title={`Ανοιχτές (${open.length})`} padded={false}>
        {busy && <Empty>Φόρτωση…</Empty>}
        {!busy && open.length === 0 && <Empty>Καμία ανοιχτή αναφορά.</Empty>}
        {open.map((r) => (
          <div key={r.id} style={{ borderBottom: `1px solid ${colors.border}`, padding: "14px 16px", background: "#FBF6EC" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <RowMain
                title={`${r.bookings ? departureLabel(r.bookings) : "Κράτηση"} · υπαίτιος: ${
                  r.at_fault_party === "client" ? "πελάτης" : "επαγγελματίας"
                }`}
                meta={
                  <>
                    <span style={money}>{r.bookings?.start_date}</span> →{" "}
                    <span style={money}>{r.bookings?.end_date}</span> · {timeAgo(r.created_at)}
                  </>
                }
              />
              <button
                style={button("primary")}
                disabled={busyId === r.id}
                onClick={() => resolve(r.id)}
              >
                {busyId === r.id ? "…" : "Επίλυση"}
              </button>
            </div>
            <p style={{ fontSize: 13, margin: "10px 0 0", color: colors.ink }}>{r.reason}</p>
            <input
              placeholder="Σημείωση επίλυσης (προαιρετικό)"
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
          </div>
        ))}
      </Panel>

      <Panel title={`Επιλυμένες (${done.length})`} padded={false}>
        {done.length === 0 && <Empty>Καμία ακόμα.</Empty>}
        {done.map((r) => (
          <Row key={r.id}>
            <RowMain
              title={r.bookings ? departureLabel(r.bookings) : "Κράτηση"}
              meta={r.resolution_note || r.reason}
            />
            <span style={{ ...muted, fontSize: 11.5, flexShrink: 0 }}>{timeAgo(r.resolved_at)}</span>
          </Row>
        ))}
      </Panel>
    </AdminShell>
  );
}
