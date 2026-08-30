"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { listMyBookingRequests, createMissingProfile, getMyClientProfile } from "../../../lib/platform/db";
import RequestPanel from "../components/RequestPanel";
import PendingReviewBanner from "../components/PendingReviewBanner";
import Stars from "../components/Stars";
import Toast from "../components/Toast";
import { container, card, h1, sectionLabel, muted, button, colors, money } from "../../../lib/platform/theme";

// Κρατάει το ίδιο κατώφλι με το reliability_min_history στη βάση (0027) και
// με το wallet του επαγγελματία: κάτω από τρία περιστατικά δεν δείχνουμε
// ποσοστό — μία ακύρωση στην πρώτη κράτηση έβγαζε «0%», νούμερο που δεν
// περιγράφει κανέναν, μόνο το ότι δεν υπάρχει ακόμα ιστορικό να περιγραφεί.
const MIN_RELIABILITY_HISTORY = 3;

function MissingProfile({ refresh, loadError }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (loadError) {
    return (
      <div style={container}>
        <h1 style={h1}>Ο λογαριασμός μου</h1>
        <div style={{ ...card, borderColor: colors.danger }}>
          <b>Δεν ήταν δυνατή η φόρτωση του προφίλ σου.</b>
          <p style={{ color: colors.danger, fontFamily: "monospace", fontSize: 13, wordBreak: "break-word" }}>
            {loadError}
          </p>
          <button style={button("secondary")} onClick={refresh}>
            Δοκίμασε ξανά
          </button>
        </div>
      </div>
    );
  }

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

// The account's overview + whatever needs a decision right now (open
// requests waiting on a reply). Everything settled — actual bookings, past
// requests — moved to its own page (/platform/client/bookings): a dashboard
// that never ends because it's also the archive stops being a dashboard.
export default function ClientDashboard() {
  const { session, loading, refresh, loadError, role } = useAuth();
  const [requests, setRequests] = useState([]);
  const [clientProfile, setClientProfile] = useState(null);
  const [busy, setBusy] = useState(true);
  const [toast, setToast] = useState(null);

  async function load() {
    setBusy(true);
    try {
      const [r, cp] = await Promise.all([listMyBookingRequests(), getMyClientProfile()]);
      setRequests(r);
      setClientProfile(cp);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (session) load();
  }, [session]);

  if (loading) return <div style={container}>Φόρτωση...</div>;
  if (!session) return <div style={container}>Χρειάζεται σύνδεση.</div>;
  if (busy && !clientProfile) return <div style={container}>Φόρτωση...</div>;
  if (!clientProfile) return <MissingProfile refresh={refresh} loadError={loadError} />;

  const openRequests = requests.filter((r) => r.status === "open");
  const history = (clientProfile?.completed_bookings_count || 0) + (clientProfile?.cancellation_flag_count || 0);

  return (
    <div style={container}>
      <h1 style={h1}>Ο λογαριασμός μου</h1>
      {/* Only shown to an account that also has another hat (skipper, admin)
          — the menu item that brought them here says "ως πελάτης", so the
          page itself should say it too, instead of landing on a bare title
          that reads as if it switched to someone else's account. */}
      {role && role !== "client" && <p style={{ ...muted, marginTop: -8, marginBottom: 16 }}>ως πελάτης</p>}
      <PendingReviewBanner bookingsHref="/platform/client/bookings" />

      {/* Same standing block a professional gets: clients are rated too, and
          a skipper deciding whether to claim their request reads exactly
          these numbers. */}
      <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12, paddingBottom: 10, marginTop: 8 }}>
        <Stars rating={clientProfile?.rating_avg} count={clientProfile?.rating_count ?? 0} size={17} />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          flexWrap: "wrap",
          padding: "10px 2px",
          borderTop: `1px solid ${colors.border}`,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <span style={{ fontSize: 13, color: colors.inkSoft }}>Wallet</span>
        <b style={{ ...money, fontSize: 14, fontWeight: 600, color: colors.ink, marginLeft: 6 }}>
          {clientProfile?.wallet_balance ?? 0}€
        </b>
        <span style={{ fontSize: 13, color: colors.inkSoft, margin: "0 10px" }}>·</span>
        <span style={{ fontSize: 13, color: colors.inkSoft }}>Ολοκληρωμένες</span>
        <b style={{ ...money, fontSize: 14, fontWeight: 600, color: colors.ink, marginLeft: 6 }}>
          {clientProfile?.completed_bookings_count ?? 0}
        </b>
        <span style={{ fontSize: 13, color: colors.inkSoft, margin: "0 10px" }}>·</span>
        <span style={{ fontSize: 13, color: colors.inkSoft }}>Αξιοπιστία</span>
        <b
          style={{ ...money, fontSize: 14, fontWeight: 600, color: colors.ink, marginLeft: 6 }}
          title={
            history < MIN_RELIABILITY_HISTORY
              ? "Χρειάζονται τουλάχιστον 3 ολοκληρωμένες ή ακυρωμένες κρατήσεις"
              : undefined
          }
        >
          {history >= MIN_RELIABILITY_HISTORY && clientProfile?.reliability_percentage != null
            ? `${clientProfile.reliability_percentage}%`
            : "—"}
        </b>
      </div>

      {busy && <p style={muted}>Φόρτωση...</p>}

      <div style={{ marginTop: 32 }}>
        <h2 style={sectionLabel}>Εκκρεμή αιτήματα ({openRequests.length})</h2>
        {openRequests.length === 0 && !busy && <p style={muted}>Δεν υπάρχουν εκκρεμή αιτήματα αυτή τη στιγμή.</p>}
        {openRequests.map((r) => (
          <RequestPanel key={r.id} request={r} onChanged={load} onToastMessage={setToast} />
        ))}
      </div>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
