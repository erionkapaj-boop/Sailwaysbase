"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { listMyBookingRequests, listMyBookingsAsClient, createMissingProfile } from "../../../lib/platform/db";
import BookingPanel from "../components/BookingPanel";
import { container, card, h1, h2, muted, badge, button, colors } from "../../../lib/platform/theme";

const REQ_STATUS = {
  open: ["Αναμονή διεκδίκησης", "brand"],
  matched: ["Βρέθηκε skipper", "success"],
  expired_unclaimed: ["Άκαρπο — έγινε credit", "warn"],
  cancelled: ["Ακυρώθηκε", "danger"],
};

function MissingProfile({ refresh }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function recreate() {
    setBusy(true);
    setError("");
    try {
      await createMissingProfile("client");
      await refresh();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={container}>
      <h1 style={h1}>Ο λογαριασμός μου</h1>
      <div style={{ ...card, borderColor: colors.danger }}>
        <b>Δεν βρέθηκε προφίλ πελάτη για τον λογαριασμό σου.</b>
        <p style={muted}>Πάτα το κουμπί για να το φτιάξουμε τώρα.</p>
        <button style={button("primary")} disabled={busy} onClick={recreate}>
          {busy ? "..." : "Δημιουργία προφίλ πελάτη"}
        </button>
        {error && <p style={{ color: colors.danger, marginTop: 8 }}>{error}</p>}
      </div>
    </div>
  );
}

export default function ClientDashboard() {
  const { session, profile, userRow, loading, refresh } = useAuth();
  const [requests, setRequests] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [busy, setBusy] = useState(true);

  async function load() {
    setBusy(true);
    try {
      const [r, b] = await Promise.all([listMyBookingRequests(), listMyBookingsAsClient()]);
      setRequests(r);
      setBookings(b);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (session && userRow?.role === "client") load();
  }, [session, userRow]);

  if (loading) return <div style={container}>Φόρτωση...</div>;
  if (!session) return <div style={container}>Χρειάζεται σύνδεση.</div>;
  if (userRow?.role !== "client") return <div style={container}>Αυτή η σελίδα είναι μόνο για πελάτες.</div>;
  if (!profile) return <MissingProfile refresh={refresh} />;

  const openRequests = requests.filter((r) => r.status === "open");
  const closedRequests = requests.filter((r) => r.status !== "open");

  return (
    <div style={container}>
      <h1 style={h1}>Ο λογαριασμός μου</h1>

      <div style={{ ...card, display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div>
          <div style={muted}>Wallet credit</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{profile?.wallet_balance ?? 0}€</div>
        </div>
        <div>
          <div style={muted}>Ποσοστό αξιοπιστίας</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            {profile?.reliability_percentage != null ? `${profile.reliability_percentage}%` : "—"}
          </div>
        </div>
        <div>
          <div style={muted}>Ολοκληρωμένες κρατήσεις</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{profile?.completed_bookings_count ?? 0}</div>
        </div>
      </div>

      {busy && <p style={muted}>Φόρτωση...</p>}

      {openRequests.length > 0 && (
        <>
          <h2 style={h2}>Εκκρεμή αιτήματα</h2>
          {openRequests.map((r) => (
            <div key={r.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <b>
                  {r.ports?.name} · {r.boat_types?.name}
                </b>
                <span style={badge(REQ_STATUS[r.status]?.[1] || "neutral")}>{REQ_STATUS[r.status]?.[0] || r.status}</span>
              </div>
              <p style={muted}>
                {r.start_date} → {r.end_date} · Fee: {r.fee_amount}€ ·{" "}
                {r.fee_paid_at ? "Πληρώθηκε" : "Δεν πληρώθηκε"}
              </p>
            </div>
          ))}
        </>
      )}

      <h2 style={h2}>Κρατήσεις</h2>
      {bookings.length === 0 && !busy && <p style={muted}>Δεν υπάρχουν κρατήσεις ακόμα.</p>}
      {bookings.map((b) => (
        <BookingPanel key={b.id} booking={b} viewerRole="client" viewerUserId={userRow.id} onChanged={load} />
      ))}

      {closedRequests.length > 0 && (
        <>
          <h2 style={h2}>Ιστορικό αιτημάτων</h2>
          {closedRequests
            .filter((r) => r.status !== "matched")
            .map((r) => (
              <div key={r.id} style={{ ...card, opacity: 0.8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <span>
                    {r.ports?.name} · {r.start_date} → {r.end_date}
                  </span>
                  <span style={badge(REQ_STATUS[r.status]?.[1] || "neutral")}>{REQ_STATUS[r.status]?.[0] || r.status}</span>
                </div>
              </div>
            ))}
        </>
      )}
    </div>
  );
}
