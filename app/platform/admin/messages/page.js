"use client";
import { useEffect, useState } from "react";
import AdminShell, { useAdminCounts } from "../AdminShell";
import { Panel, Row, RowMain, Empty, colors, muted, button } from "../ui";
import { adminListContactMessages, adminSetContactMessageStatus } from "../../../../lib/platform/db";
import { timeAgo } from "../../../../lib/platform/notifications";

const TOPIC_LABEL = {
  general: "Γενική ερώτηση",
  booking: "Κράτηση / αίτημα",
  payment: "Χρέωση / πορτοφόλι",
  report: "Αναφορά",
  privacy: "Προσωπικά δεδομένα",
  other: "Άλλο",
};

// Μια αναφορά ή ένα αίτημα ΓΚΠΔ έχει προθεσμία και συνέπειες· μια γενική
// ερώτηση όχι. Ξεχωρίζουν οπτικά ώστε να μην περιμένουν στη σειρά.
const URGENT = new Set(["report", "privacy"]);

const noteInput = {
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
};

export default function AdminMessagesPage() {
  const counts = useAdminCounts();
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [notes, setNotes] = useState({});
  const [error, setError] = useState("");

  async function load() {
    try {
      setList(await adminListContactMessages());
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function setStatus(id, status) {
    setBusyId(id);
    setError("");
    try {
      await adminSetContactMessageStatus(id, status, notes[id] || null);
      await load();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusyId(null);
    }
  }

  const open = list.filter((m) => m.status === "new");
  const done = list.filter((m) => m.status === "handled");

  return (
    <AdminShell
      title="Μηνύματα"
      subtitle="Ό,τι φτάνει από τη φόρμα επικοινωνίας. Η απάντηση στέλνεται εκτός πλατφόρμας, στο στοιχείο που άφησε ο αποστολέας."
      counts={counts}
    >
      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}

      <Panel title={`Αναπάντητα (${open.length})`} padded={false}>
        {busy && <Empty>Φόρτωση…</Empty>}
        {!busy && open.length === 0 && <Empty>Κανένα αναπάντητο μήνυμα.</Empty>}
        {open.map((m) => (
          <div
            key={m.id}
            style={{
              borderBottom: `1px solid ${colors.border}`,
              padding: "14px 16px",
              background: URGENT.has(m.topic) ? "#FBF6EC" : colors.card,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <RowMain
                title={`${m.name} · ${TOPIC_LABEL[m.topic] || m.topic}`}
                meta={
                  <>
                    {m.contact} · {timeAgo(m.created_at)}
                    {m.user_id ? " · εγγεγραμμένος χρήστης" : " · επισκέπτης"}
                  </>
                }
              />
              <button style={button("primary")} disabled={busyId === m.id} onClick={() => setStatus(m.id, "handled")}>
                {busyId === m.id ? "…" : "Απαντήθηκε"}
              </button>
            </div>
            <p style={{ fontSize: 13.5, margin: "10px 0 0", color: colors.ink, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {m.message}
            </p>
            <input
              placeholder="Σημείωση (προαιρετικό)"
              value={notes[m.id] || ""}
              onChange={(e) => setNotes((n) => ({ ...n, [m.id]: e.target.value }))}
              style={noteInput}
            />
          </div>
        ))}
      </Panel>

      <Panel title={`Απαντημένα (${done.length})`} padded={false}>
        {done.length === 0 && <Empty>Κανένα ακόμα.</Empty>}
        {done.map((m) => (
          <Row key={m.id}>
            <RowMain
              title={`${m.name} · ${TOPIC_LABEL[m.topic] || m.topic}`}
              meta={m.admin_note || m.contact}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <span style={{ ...muted, fontSize: 11.5 }}>{timeAgo(m.handled_at || m.created_at)}</span>
              <button
                style={{ ...button("secondary"), padding: "4px 10px", fontSize: 12 }}
                disabled={busyId === m.id}
                onClick={() => setStatus(m.id, "new")}
              >
                Άνοιγμα
              </button>
            </div>
          </Row>
        ))}
      </Panel>
    </AdminShell>
  );
}
