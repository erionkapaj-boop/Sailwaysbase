"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import {
  adminListPendingSkippers,
  adminApproveSkipper,
  adminRejectSkipper,
  adminListCancellationReports,
  adminListBookings,
  adminListActions,
  adminFindUserByPhone,
  adminCreditWallet,
} from "../../../lib/platform/db";
import { container, card, h1, h2, muted, button, input, badge, colors } from "../../../lib/platform/theme";

function PendingSkippers() {
  const [list, setList] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    setList(await adminListPendingSkippers());
  }
  useEffect(() => {
    load();
  }, []);

  async function approve(userId) {
    setBusyId(userId);
    setError("");
    try {
      const result = await adminApproveSkipper(userId);
      await load();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function reject(userId) {
    const notes = prompt("Λόγος απόρριψης (προαιρετικό):") || "";
    setBusyId(userId);
    try {
      await adminRejectSkipper(userId, notes);
      await load();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h2 style={h2}>Εκκρεμείς εγκρίσεις skippers ({list.length})</h2>
      {error && <p style={{ color: colors.danger }}>{error}</p>}
      {list.length === 0 && <p style={muted}>Καμία εκκρεμότητα.</p>}
      {list.map((s) => (
        <div key={s.user_id} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <b>{s.full_name || "(χωρίς όνομα ακόμα)"}</b>
              <p style={muted}>
                Δίπλωμα: {s.license_number} ({s.license_type}) · Τηλ: {s.users?.phone_number} · {s.price_per_day}€/ημ
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={button("primary")} disabled={busyId === s.user_id} onClick={() => approve(s.user_id)}>
                Έγκριση
              </button>
              <button style={button("danger")} disabled={busyId === s.user_id} onClick={() => reject(s.user_id)}>
                Απόρριψη
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CancellationReports() {
  const [list, setList] = useState([]);
  useEffect(() => {
    adminListCancellationReports().then(setList).catch(() => {});
  }, []);
  return (
    <div>
      <h2 style={h2}>Αναφορές ακύρωσης / flags</h2>
      {list.length === 0 && <p style={muted}>Καμία αναφορά.</p>}
      {list.map((r) => (
        <div key={r.id} style={card}>
          <b>Υπαίτιος: {r.at_fault_party === "client" ? "Πελάτης" : "Skipper"}</b>
          <p style={muted}>
            {r.bookings?.ports?.name} · {r.reason}
          </p>
        </div>
      ))}
    </div>
  );
}

function WalletTopup() {
  const [phone, setPhone] = useState("");
  const [results, setResults] = useState([]);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function search() {
    setResults(await adminFindUserByPhone(phone));
  }

  async function credit() {
    if (!selected || !amount) return;
    setBusy(true);
    setMsg("");
    try {
      await adminCreditWallet(selected.id, Number(amount), notes || `Χειροκίνητη κατάθεση ${amount}€`);
      setMsg("✓ Πιστώθηκε.");
      setAmount("");
    } catch (err) {
      setMsg(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={card}>
      <h2 style={h2}>Χειροκίνητη πίστωση wallet</h2>
      <p style={muted}>Μετά από επιβεβαιωμένη τραπεζική κατάθεση/κάρτα εκτός πλατφόρμας.</p>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input style={input} placeholder="Τηλέφωνο χρήστη" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <button style={button("secondary")} onClick={search}>
          Αναζήτηση
        </button>
      </div>
      {results.map((u) => (
        <div
          key={u.id}
          onClick={() => setSelected(u)}
          style={{
            padding: 8,
            marginTop: 6,
            borderRadius: 6,
            cursor: "pointer",
            background: selected?.id === u.id ? "#E4F3F7" : "#F6F8FA",
          }}
        >
          {u.phone_number} · {u.role}
        </div>
      ))}
      {selected && (
        <div style={{ marginTop: 10 }}>
          <input
            type="number"
            style={input}
            placeholder="Ποσό €"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input
            style={{ ...input, marginTop: 6 }}
            placeholder="Σημειώσεις"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <button style={{ ...button("primary"), marginTop: 8 }} disabled={busy} onClick={credit}>
            Πίστωση {selected.phone_number}
          </button>
        </div>
      )}
      {msg && <p style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  );
}

function BookingsOverview() {
  const [list, setList] = useState([]);
  useEffect(() => {
    adminListBookings().then(setList).catch(() => {});
  }, []);
  return (
    <div>
      <h2 style={h2}>Όλες οι κρατήσεις ({list.length})</h2>
      {list.map((b) => (
        <div key={b.id} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <span>
              {b.ports?.name} · {b.start_date} → {b.end_date}
            </span>
            <span style={badge("neutral")}>{b.status}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const { session, userRow, loading } = useAuth();
  const [tab, setTab] = useState("skippers");

  if (loading) return <div style={container}>Φόρτωση...</div>;
  if (!session) return <div style={container}>Χρειάζεται σύνδεση.</div>;
  if (userRow?.role !== "admin") return <div style={container}>Πρόσβαση μόνο για admin.</div>;

  return (
    <div style={container}>
      <h1 style={h1}>Admin</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          ["skippers", "Εγκρίσεις"],
          ["flags", "Flags/Ακυρώσεις"],
          ["wallet", "Πίστωση wallet"],
          ["bookings", "Κρατήσεις"],
        ].map(([key, lbl]) => (
          <button key={key} style={button(tab === key ? "primary" : "secondary")} onClick={() => setTab(key)}>
            {lbl}
          </button>
        ))}
      </div>
      {tab === "skippers" && <PendingSkippers />}
      {tab === "flags" && <CancellationReports />}
      {tab === "wallet" && <WalletTopup />}
      {tab === "bookings" && <BookingsOverview />}
    </div>
  );
}
