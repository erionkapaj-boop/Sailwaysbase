"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "../AuthContext";
import { listMyBookingsAsClient, listMyBookingsAsSkipper } from "../../../lib/platform/db";
import BookingPanel from "../components/BookingPanel";
import PendingReviewBanner from "../components/PendingReviewBanner";
import { container, h1, sectionLabel, muted } from "../../../lib/platform/theme";

export default function BookingsPage() {
  return (
    <Suspense fallback={<div style={container}>Φόρτωση...</div>}>
      <BookingsInner />
    </Suspense>
  );
}

// useSearchParams() (για ?focus=<bookingId>, από το κουδουνάκι μηνυμάτων)
// χρειάζεται Suspense boundary γύρω του στο app router.
function BookingsInner() {
  const { session, userRow, profile, isAdmin, loading, notifications } = useAuth();
  const searchParams = useSearchParams();
  const focusBookingId = searchParams.get("focus");
  const [clientBookings, setClientBookings] = useState([]);
  const [proBookings, setProBookings] = useState([]);
  const [busy, setBusy] = useState(true);

  const isProfessional = userRow?.role === "skipper" || isAdmin;

  async function load() {
    setBusy(true);
    try {
      const [cb, pb] = await Promise.all([
        listMyBookingsAsClient(),
        isProfessional && profile?.id ? listMyBookingsAsSkipper(profile.id) : Promise.resolve([]),
      ]);
      setClientBookings(cb);
      setProBookings(pb);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (session) load();
  }, [session, profile?.id]);

  if (loading) return <div style={container}>Φόρτωση...</div>;
  if (!session) return <div style={container}>Χρειάζεται σύνδεση.</div>;

  const unreadIds = notifications?.unreadBookingIds ?? [];

  return (
    <div style={container}>
      <h1 style={h1}>Κρατήσεις</h1>
      <PendingReviewBanner bookingsHref="/platform/bookings" />

      {isProfessional && (
        <div style={{ marginTop: 8 }}>
          <h2 style={sectionLabel}>Ως επαγγελματίας ({proBookings.length})</h2>
          {busy && <p style={muted}>Φόρτωση...</p>}
          {!busy && proBookings.length === 0 && <p style={muted}>Δεν υπάρχουν κρατήσεις ακόμα.</p>}
          {proBookings.map((b) => (
            <BookingPanel
              key={b.id}
              booking={b}
              viewerRole={profile?.role || "skipper"}
              viewerUserId={userRow.id}
              onChanged={load}
              autoExpand={b.id === focusBookingId}
              hasUnread={unreadIds.includes(b.id)}
            />
          ))}
        </div>
      )}

      <div style={{ marginTop: 32 }}>
        <h2 style={sectionLabel}>Ως πελάτης ({clientBookings.length})</h2>
        {busy && <p style={muted}>Φόρτωση...</p>}
        {!busy && clientBookings.length === 0 && <p style={muted}>Δεν υπάρχουν κρατήσεις ακόμα.</p>}
        {clientBookings.map((b) => (
          <BookingPanel
            key={b.id}
            booking={b}
            viewerRole="client"
            viewerUserId={userRow.id}
            onChanged={load}
            autoExpand={b.id === focusBookingId}
            hasUnread={unreadIds.includes(b.id)}
          />
        ))}
      </div>
    </div>
  );
}
