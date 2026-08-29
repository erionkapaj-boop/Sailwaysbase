"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "../AuthContext";
import {
  listMyBookingRequests,
  listMyBookingsAsClient,
  createMissingProfile,
  getMyClientProfile,
  departureLabel,
} from "../../../lib/platform/db";
import BookingPanel from "../components/BookingPanel";
import RequestPanel from "../components/RequestPanel";
import PendingReviewBanner from "../components/PendingReviewBanner";
import Stars from "../components/Stars";
import Toast from "../components/Toast";
import { formatDateTime, formatDate } from "../../../lib/platform/notifications";
import {
  container,
  card,
  h1,
  sectionLabel,
  muted,
  badge,
  button,
  colors,
  money,
} from "../../../lib/platform/theme";

const REQ_STATUS = {
  open: ["Αναμονή διεκδίκησης", "brand"],
  matched: ["Βρέθηκε skipper", "success"],
  expired_unclaimed: ["Άκαρπο — έγινε credit", "warn"],
  cancelled: ["Ακυρώθηκε", "danger"],
};

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

export default function ClientDashboard() {
  return (
    <Suspense fallback={<div style={container}>Φόρτωση...</div>}>
      <ClientDashboardInner />
    </Suspense>
  );
}

// useSearchParams() (for ?focus=<bookingId>, used by the header's message
// icon) requires a Suspense boundary around it in the app router.
function ClientDashboardInner() {
  const { session, userRow, loading, refresh, loadError, notifications } = useAuth();
  const searchParams = useSearchParams();
  const focusBookingId = searchParams.get("focus");
  const [requests, setRequests] = useState([]);
  const [bookings, setBookings] = useState([]);
  // Fetched here rather than taken from AuthContext: for a professional that
  // context holds their *crew* profile, while this page is about the same
  // person as a customer. Both exist for every account now.
  const [clientProfile, setClientProfile] = useState(null);
  const [busy, setBusy] = useState(true);
  const [toast, setToast] = useState(null);

  async function load() {
    setBusy(true);
    try {
      const [r, b, cp] = await Promise.all([
        listMyBookingRequests(),
        listMyBookingsAsClient(),
        getMyClientProfile(),
      ]);
      setRequests(r);
      setBookings(b);
      setClientProfile(cp);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (session && userRow) load();
  }, [session, userRow]);

  if (loading) return <div style={container}>Φόρτωση...</div>;
  if (!session) return <div style={container}>Χρειάζεται σύνδεση.</div>;
  if (busy && !clientProfile) return <div style={container}>Φόρτωση...</div>;
  if (!clientProfile) return <MissingProfile refresh={refresh} loadError={loadError} />;

  const openRequests = requests.filter((r) => r.status === "open");
  const closedRequests = requests.filter((r) => r.status !== "open");

  return (
    <div style={container}>
      <h1 style={h1}>Ο λογαριασμός μου</h1>
      <PendingReviewBanner />

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
        <b style={{ ...money, fontSize: 14, fontWeight: 600, color: colors.ink, marginLeft: 6 }}>
          {clientProfile?.reliability_percentage != null ? `${clientProfile.reliability_percentage}%` : "—"}
        </b>
      </div>

      {busy && <p style={muted}>Φόρτωση...</p>}

      {openRequests.length > 0 && (
        <>
          <h2 style={sectionLabel}>Εκκρεμή αιτήματα</h2>
          {openRequests.map((r) => (
            <RequestPanel key={r.id} request={r} onChanged={load} onToastMessage={setToast} />
          ))}
        </>
      )}

      <h2 style={sectionLabel}>Κρατήσεις</h2>
      {bookings.length === 0 && !busy && <p style={muted}>Δεν υπάρχουν κρατήσεις ακόμα.</p>}
      {bookings.map((b) => (
        <BookingPanel
          key={b.id}
          booking={b}
          viewerRole="client"
          viewerUserId={userRow.id}
          onChanged={load}
          autoExpand={b.id === focusBookingId}
          hasUnread={(notifications?.unreadBookingIds ?? []).includes(b.id)}
        />
      ))}

      {closedRequests.length > 0 && (
        <>
          <h2 style={sectionLabel}>Ιστορικό αιτημάτων</h2>
          {closedRequests
            .filter((r) => r.status !== "matched")
            .map((r) => (
              <div key={r.id} style={{ ...card, opacity: 0.75 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <span>
                    {departureLabel(r)} · <span style={money}>{formatDate(r.start_date)}</span> →{" "}
                    <span style={money}>{formatDate(r.end_date)}</span>
                  </span>
                  <span style={badge(REQ_STATUS[r.status]?.[1] || "neutral")}>{REQ_STATUS[r.status]?.[0] || r.status}</span>
                </div>
                <p style={{ ...muted, fontSize: 12, margin: "4px 0 0" }}>Στάλθηκε {formatDateTime(r.created_at)}</p>
              </div>
            ))}
        </>
      )}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
