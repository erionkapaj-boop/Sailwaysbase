"use client";
import { useEffect, useState } from "react";
import LoadError from "../components/LoadError";
import { useAuth } from "../AuthContext";
import { listMyBookingsAsSkipper } from "../../../lib/platform/db";
import MissingProfile from "../skipper/MissingProfile";
import AvailabilityCalendar from "../skipper/AvailabilityCalendar";
import { container, h1, muted } from "../../../lib/platform/theme";
import SignedOutNotice from "../components/SignedOutNotice";

export default function AvailabilityPage() {
  const { session, profile, userRow, loading, refresh, loadError, isAdmin } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [bookingsFailed, setBookingsFailed] = useState(false);

  // The calendar marks booked days from these; if they didn't load it would
  // show those days as free, so say so instead.
  function loadBookings() {
    if (!profile?.id) return;
    setBookingsFailed(false);
    listMyBookingsAsSkipper(profile.id)
      .then(setBookings)
      .catch((err) => { console.error(err); setBookingsFailed(true); });
  }

  useEffect(loadBookings, [profile?.id]);

  if (loading) return <div style={container}>Φόρτωση...</div>;
  if (!session) return <SignedOutNotice />;
  if (userRow?.role !== "skipper" && !isAdmin)
    return <div style={container}>Αυτή η σελίδα είναι μόνο για επαγγελματίες.</div>;
  if (!profile) return <MissingProfile userRow={userRow} isAdmin={isAdmin} refresh={refresh} loadError={loadError} />;

  return (
    <div style={container}>
      <h1 style={h1}>Η διαθεσιμότητά μου</h1>
      {userRow?.role !== "skipper" && <p style={{ ...muted, marginTop: -8, marginBottom: 16 }}>ως επαγγελματίας</p>}
      <div style={{ marginTop: 20 }}>
        {bookingsFailed && <LoadError what="οι κρατήσεις σου (οι μέρες τους δεν φαίνονται στο ημερολόγιο)" onRetry={loadBookings} />}
        <AvailabilityCalendar skipperId={profile.id} bookings={bookings} />
      </div>
    </div>
  );
}
