"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "../../AuthContext";
import { listMyBookingsAsSkipper } from "../../../../lib/platform/db";
import MissingProfile from "../MissingProfile";
import BookingPanel from "../../components/BookingPanel";
import BackButton from "../../components/BackButton";
import { container, h1, muted } from "../../../../lib/platform/theme";

export default function SkipperBookingsPage() {
  return (
    <Suspense fallback={<div style={container}>Φόρτωση...</div>}>
      <SkipperBookingsInner />
    </Suspense>
  );
}

// useSearchParams() (for ?focus=<bookingId>, used by the header's message
// icon) requires a Suspense boundary around it in the app router.
function SkipperBookingsInner() {
  const { session, profile, userRow, loading, refresh, loadError, notifications, isAdmin } = useAuth();
  const searchParams = useSearchParams();
  const focusBookingId = searchParams.get("focus");
  const [bookings, setBookings] = useState([]);
  const [busy, setBusy] = useState(true);

  async function load() {
    if (!profile?.id) return;
    setBusy(true);
    try {
      setBookings(await listMyBookingsAsSkipper(profile.id));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, [profile?.id]);

  if (loading) return <div style={container}>Φόρτωση...</div>;
  if (!session) return <div style={container}>Χρειάζεται σύνδεση.</div>;
  if (userRow?.role !== "skipper" && !isAdmin)
    return <div style={container}>Αυτή η σελίδα είναι μόνο για επαγγελματίες.</div>;
  if (!profile) return <MissingProfile userRow={userRow} isAdmin={isAdmin} refresh={refresh} loadError={loadError} />;

  return (
    <div style={container}>
      <BackButton href="/platform/skipper" />
      <h1 style={{ ...h1, marginTop: 14 }}>Οι κρατήσεις μου</h1>
      {userRow?.role !== "skipper" && <p style={{ ...muted, marginTop: -8, marginBottom: 16 }}>ως επαγγελματίας</p>}

      {busy && <p style={muted}>Φόρτωση...</p>}
      {!busy && bookings.length === 0 && <p style={muted}>Δεν υπάρχουν κρατήσεις ακόμα.</p>}
      {bookings.map((b) => (
        <BookingPanel
          key={b.id}
          booking={b}
          viewerRole={profile.role || "skipper"}
          viewerUserId={userRow.id}
          onChanged={load}
          autoExpand={b.id === focusBookingId}
          hasUnread={notifications.unreadBookingIds.includes(b.id)}
        />
      ))}
    </div>
  );
}
