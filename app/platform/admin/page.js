"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../AuthContext";
import {
  adminListPendingSkippers,
  adminApproveSkipper,
  adminRejectSkipper,
  adminListCancellationReports,
  adminListBookings,
  adminFindUserByPhone,
  adminCreditWallet,
  adminListUsers,
  adminSeedDemoUsers,
} from "../../../lib/platform/db";
import { labelForRole } from "../../../lib/platform/roles";
import { container, card, h1, h2, muted, button, input, badge, colors, money } from "../../../lib/platform/theme";

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
              <div style={{ fontWeight: 500, fontSize: 15 }}>{s.full_name || "(χωρίς όνομα ακόμα)"}</div>
              <p style={{ ...muted, margin: "6px 0 0" }}>
                {labelForRole(s.role || "skipper")}
                {" · "}
                <span style={money}>{s.users?.phone_number}</span>
                {" · "}
                <span style={{ ...money, color: colors.ink }}>{s.price_per_day}€</span>/ημέρα
                {" · "}
                <span style={money}>{s.years_experience}</span> χρόνια
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
            background: selected?.id === u.id ? "#EEEEEF" : colors.bg,
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

function UsersList() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [seedResult, setSeedResult] = useState(null);
  const [seeding, setSeeding] = useState(false);

  async function load(opts) {
    setBusy(true);
    setError("");
    try {
      setList(await adminListUsers(opts));
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load({ search: "", role: "" });
  }, []);

  function submit(e) {
    e.preventDefault();
    load({ search, role: roleFilter });
  }

  async function seed() {
    setSeeding(true);
    setError("");
    try {
      const res = await adminSeedDemoUsers();
      setSeedResult(res);
      await load({ search: "", role: "" });
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div>
      <h2 style={h2}>Χρήστες</h2>
      <p style={muted}>Αναζήτηση με τηλέφωνο ή ονοματεπώνυμο. Πάτα σε κάποιον για να δεις τον λογαριασμό του.</p>

      <div style={{ ...card, borderLeft: `3px solid ${colors.warn}` }}>
        <b style={{ fontWeight: 600, fontSize: 14 }}>Δοκιμαστικά δεδομένα</b>
        <p style={{ ...muted, fontSize: 13, margin: "6px 0 12px" }}>
          Δημιουργεί 7 ψεύτικους λογαριασμούς (5 επαγγελματίες, 2 πελάτες) στο εύρος
          <span style={money}> 6980000004</span>–<span style={money}>698000000010</span>, όλοι με κωδικό{" "}
          <span style={money}>123456</span>. Αν ξανατρέξει, δεν διπλασιάζει τίποτα.
        </p>
        <button style={button("secondary")} disabled={seeding} onClick={seed}>
          {seeding ? "Δημιουργία…" : "Δημιουργία δοκιμαστικών λογαριασμών"}
        </button>
        {seedResult && (
          <div style={{ ...muted, fontSize: 13, marginTop: 12 }}>
            {seedResult.created?.length > 0 && (
              <>
                <div style={{ color: colors.success }}>Δημιουργήθηκαν {seedResult.created.length}:</div>
                {seedResult.created.map((c) => (
                  <div key={c}>{c}</div>
                ))}
              </>
            )}
            {seedResult.skipped?.length > 0 && (
              <div style={{ marginTop: 6 }}>Υπήρχαν ήδη: {seedResult.skipped.length}</div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={submit} style={{ ...card, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          style={{ ...input, flex: "2 1 200px", width: "auto" }}
          placeholder="Τηλέφωνο ή όνομα"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          style={{ ...input, flex: "1 1 140px", width: "auto" }}
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">Όλοι οι ρόλοι</option>
          <option value="client">Πελάτες</option>
          <option value="skipper">Επαγγελματίες</option>
          <option value="admin">Admins</option>
        </select>
        <button type="submit" style={button("secondary")}>
          Αναζήτηση
        </button>
      </form>

      {error && <p style={{ color: colors.danger }}>{error}</p>}
      {busy && <p style={muted}>Φόρτωση…</p>}
      {!busy && list.length === 0 && <p style={muted}>Κανένας χρήστης δεν ταιριάζει.</p>}

      {list.map((u) => (
        <Link key={u.id} href={`/platform/admin/user/${u.id}`} style={{ textDecoration: "none", color: "inherit" }}>
          <div style={{ ...card, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 500 }}>{u.full_name || "(χωρίς όνομα)"}</div>
                <div style={{ ...muted, marginTop: 4 }}>
                  <span style={money}>{u.phone_number}</span>
                  {u.email ? ` · ${u.email}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <span style={badge("neutral")}>{u.role}</span>
                {u.status !== "active" && <span style={badge("warn")}>{u.status}</span>}
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const { session, userRow, loading } = useAuth();
  const [tab, setTab] = useState("users");

  if (loading) return <div style={container}>Φόρτωση...</div>;
  if (!session) {
    return (
      <div style={container}>
        <p style={muted}>
          Χρειάζεται σύνδεση διαχειριστή.{" "}
          <Link href="/platform/admin/login" style={{ color: colors.ink }}>
            Είσοδος admin
          </Link>
        </p>
      </div>
    );
  }
  if (userRow?.role !== "admin") return <div style={container}>Πρόσβαση μόνο για admin.</div>;

  return (
    <div style={container}>
      <h1 style={h1}>Admin</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          ["users", "Χρήστες"],
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
      {tab === "users" && <UsersList />}
      {tab === "skippers" && <PendingSkippers />}
      {tab === "flags" && <CancellationReports />}
      {tab === "wallet" && <WalletTopup />}
      {tab === "bookings" && <BookingsOverview />}
    </div>
  );
}
