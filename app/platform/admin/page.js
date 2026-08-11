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
  adminSearchSkippersByName,
  adminGetUserOverview,
} from "../../../lib/platform/db";
import Stat from "../components/Stat";
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
                Δίπλωμα <span style={{ ...money, color: colors.ink }}>{s.license_number}</span>
                {s.license_type ? ` (${s.license_type})` : ""}
                {" · "}
                <span style={money}>{s.users?.phone_number}</span>
                {" · "}
                <span style={{ ...money, color: colors.ink }}>{s.price_per_day}€</span>/ημέρα
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

function ViewAsUser() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [overview, setOverview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function search(e) {
    e?.preventDefault();
    setError("");
    setSelected(null);
    setOverview(null);
    setBusy(true);
    try {
      const [byPhone, byName] = await Promise.all([
        adminFindUserByPhone(query).catch(() => []),
        adminSearchSkippersByName(query).catch(() => []),
      ]);
      const fromSkippers = byName
        .filter((s) => s.users)
        .map((s) => ({ id: s.user_id, phone_number: s.users.phone_number, role: "skipper", full_name: s.full_name }));
      const merged = [...byPhone, ...fromSkippers].filter(
        (u, i, arr) => arr.findIndex((x) => x.id === u.id) === i
      );
      setResults(merged);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function view(u) {
    setSelected(u);
    setOverview(null);
    setError("");
    setBusy(true);
    try {
      setOverview(await adminGetUserOverview(u.id, u.role));
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 style={h2}>Προβολή χρήστη</h2>
      <p style={muted}>Αναζήτηση με τηλέφωνο (πελάτης/skipper) ή ονοματεπώνυμο (skipper). Μόνο προβολή, καμία ενέργεια εκ μέρους τους.</p>
      <form onSubmit={search} style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <input style={input} placeholder="Τηλέφωνο ή όνομα" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button style={button("secondary")} disabled={busy} type="submit">
          Αναζήτηση
        </button>
      </form>
      {error && <p style={{ color: colors.danger, marginTop: 8 }}>{error}</p>}

      {results.map((u) => (
        <div
          key={u.id}
          onClick={() => view(u)}
          style={{
            padding: 8,
            marginTop: 6,
            borderRadius: 6,
            cursor: "pointer",
            background: selected?.id === u.id ? "#EEEEEF" : colors.bg,
          }}
        >
          {u.full_name ? `${u.full_name} · ` : ""}
          {u.phone_number} · {u.role}
        </div>
      ))}

      {overview && (
        <div style={{ marginTop: 16 }}>
          {overview.role === "client" && (
            <>
              <div style={{ ...card, display: "flex", gap: 36, flexWrap: "wrap" }}>
                <Stat label="Wallet" value={`${overview.profile?.wallet_balance ?? 0}€`} />
                <Stat
                  label="Αξιοπιστία"
                  value={
                    overview.profile?.reliability_percentage != null
                      ? `${overview.profile.reliability_percentage}%`
                      : "—"
                  }
                />
                <Stat label="Ολοκληρωμένες" value={overview.profile?.completed_bookings_count ?? 0} />
              </div>
              <h2 style={h2}>Αιτήματα ({overview.requests.length})</h2>
              {overview.requests.map((r) => (
                <div key={r.id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <span>
                      {r.ports?.name} · {r.start_date} → {r.end_date}
                    </span>
                    <span style={badge("neutral")}>{r.status}</span>
                  </div>
                </div>
              ))}
              <h2 style={h2}>Κρατήσεις ({overview.bookings.length})</h2>
              {overview.bookings.map((b) => (
                <div key={b.id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <span>
                      {b.ports?.name} · {b.start_date} → {b.end_date}
                    </span>
                    <span style={badge("neutral")}>{b.status}</span>
                  </div>
                </div>
              ))}
            </>
          )}

          {overview.role === "skipper" && (
            <>
              {!overview.profile ? (
                <p style={muted}>Δεν βρέθηκε προφίλ skipper για αυτόν τον χρήστη.</p>
              ) : (
                <>
                  <div style={{ ...card, display: "flex", gap: 36, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ ...muted, fontSize: 13 }}>Όνομα</div>
                      <div style={{ fontSize: 17, fontWeight: 500, marginTop: 4 }}>
                        {overview.profile.full_name || "—"}
                      </div>
                    </div>
                    <Stat label="Κατάσταση έγκρισης" value={overview.profile.approval_status} />
                    <Stat label="Wallet" value={`${overview.profile.wallet_balance}€`} />
                    <Stat label="Βαθμίδα" value={overview.profile.tier} />
                  </div>
                  <h2 style={h2}>Κρατήσεις ({overview.bookings.length})</h2>
                  {overview.bookings.map((b) => (
                    <div key={b.id} style={card}>
                      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                        <span>
                          {b.ports?.name} · {b.start_date} → {b.end_date}
                        </span>
                        <span style={badge("neutral")}>{b.status}</span>
                      </div>
                    </div>
                  ))}
                  <h2 style={h2}>Καμπανάκια που δέχτηκε ({overview.pings.length})</h2>
                  {overview.pings.map((p) => (
                    <div key={p.id} style={card}>
                      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                        <span>
                          {p.booking_requests?.ports?.name} · {p.booking_requests?.start_date} → {p.booking_requests?.end_date}
                        </span>
                        <span style={badge("neutral")}>{p.status}</span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
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
          ["viewas", "Προβολή χρήστη"],
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
      {tab === "viewas" && <ViewAsUser />}
    </div>
  );
}
