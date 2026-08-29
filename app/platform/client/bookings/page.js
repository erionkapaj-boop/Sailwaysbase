"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "../../AuthContext";
import { listMyBookingRequests, listMyBookingsAsClient, departureLabel } from "../../../../lib/platform/db";
import BookingPanel from "../../components/BookingPanel";
import BackButton from "../../components/BackButton";
import { formatDateTime, formatDate } from "../../../../lib/platform/notifications";
import { container, card, h1, sectionLabel, muted, badge, colors, money } from "../../../../lib/platform/theme";

const REQ_STATUS = {
  matched: ["Βρέθηκε skipper", "success"],
  expired_unclaimed: ["Άκαρπο — έγινε credit", "warn"],
  cancelled: ["Ακυρώθηκε", "danger"],
};

export default function ClientBookingsPage() {
  return (
    <Suspense fallback={<div style={container}>Φόρτωση...</div>}>
      <ClientBookingsInner />
    </Suspense>
  );
}

// useSearchParams() (for ?focus=<bookingId>, used by the header's message
// icon) requires a Suspense boundary around it in the app router.
function ClientBookingsInner() {
  const { session, userRow, loading, notifications, role } = useAuth();
  const searchParams = useSearchParams();
  const focusBookingId = searchParams.get("focus");
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
    if (session && userRow) load();
  }, [session, userRow]);

  if (loading) return <div style={container}>Φόρτωση...</div>;
  if (!session) return <div style={container}>Χρειάζεται σύνδεση.</div>;

  const closedRequests = requests.filter((r) => r.status !== "open" && r.status !== "matched");

  return (
    <div style={container}>
      <BackButton href="/platform/client" />
      <h1 style={{ ...h1, marginTop: 14 }}>Οι κρατήσεις μου</h1>
      {role && role !== "client" && <p style={{ ...muted, marginTop: -8, marginBottom: 16 }}>ως πελάτης</p>}

      {busy && <p style={muted}>Φόρτωση...</p>}
      {!busy && bookings.length === 0 && <p style={muted}>Δεν υπάρχουν κρατήσεις ακόμα.</p>}
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
          <h2 style={{ ...sectionLabel, marginTop: 32 }}>Ιστορικό αιτημάτων</h2>
          {closedRequests.map((r) => (
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
    </div>
  );
}
