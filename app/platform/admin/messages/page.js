"use client";
import { useEffect, useState } from "react";
import AdminShell, { useRefreshAdminCounts } from "../AdminShell";
import Link from "next/link";
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

// Replies happen outside the platform, on whatever the sender left — so the
// page offers that channel directly instead of leaving it to copy/paste.
function replyLinks(contact) {
  const c = (contact || "").trim();
  if (c.includes("@")) return [{ href: `mailto:${c}`, label: "Απάντηση με email" }];
  const digits = c.replace(/[^\d+]/g, "");
  if (digits.replace(/\D/g, "").length >= 8) {
    const tel = digits.startsWith("+") ? digits : digits.length === 10 ? `+30${digits}` : digits;
    return [{ href: `tel:${tel}`, label: "Κλήση" }];
  }
  return [];
}

// Phone numbers are stored as +30…; searching the last 10 digits matches
// however the sender typed theirs.
function searchTerm(contact) {
  const c = (contact || "").trim();
  if (c.includes("@")) return c;
  const digits = c.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : c;
}

export default function AdminMessagesPage() {
  const refreshCounts = useRefreshAdminCounts();
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
      refreshCounts();
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
      title="Μηνύματα επικοινωνίας"
      subtitle="Ό,τι φτάνει από τη φόρμα επικοινωνίας. Απαντάς με email ή τηλέφωνο, στο στοιχείο που άφησε ο αποστολέας, και μετά πατάς «Το απάντησα»."
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
            <RowMain
              title={`${m.name} · ${TOPIC_LABEL[m.topic] || m.topic}`}
              meta={
                <>
                  {m.contact} · {timeAgo(m.created_at)}
                  {m.user_id ? " · εγγεγραμμένος χρήστης" : " · επισκέπτης (χωρίς λογαριασμό)"}
                </>
              }
            />
            <p style={{ fontSize: 13.5, margin: "10px 0 0", color: colors.ink, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {m.message}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {replyLinks(m.contact).map((r) => (
                <a key={r.href} href={r.href} style={{ ...button("secondary"), textDecoration: "none" }}>
                  {r.label}
                </a>
              ))}
              {m.user_id ? (
                <Link href={`/platform/admin/user/${m.user_id}`} style={{ ...button("secondary"), textDecoration: "none" }}>
                  Στοιχεία χρήστη
                </Link>
              ) : (
                // A visitor who can't log in (e.g. forgot the PIN) writes in
                // without an account link — this finds them by what they left.
                <Link
                  href={`/platform/admin/users?q=${encodeURIComponent(searchTerm(m.contact))}`}
                  style={{ ...button("secondary"), textDecoration: "none" }}
                >
                  Βρες τον λογαριασμό του
                </Link>
              )}
            </div>
            <input
              placeholder="Σημείωση: τι απάντησες ή τι έκανες (προαιρετικό)"
              value={notes[m.id] || ""}
              onChange={(e) => setNotes((n) => ({ ...n, [m.id]: e.target.value }))}
              style={noteInput}
            />
            <button
              style={{ ...button("primary"), marginTop: 10 }}
              disabled={busyId === m.id}
              onClick={() => setStatus(m.id, "handled")}
            >
              {busyId === m.id ? "…" : "Το απάντησα"}
            </button>
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
                Ξανά αναπάντητο
              </button>
            </div>
          </Row>
        ))}
      </Panel>
    </AdminShell>
  );
}
