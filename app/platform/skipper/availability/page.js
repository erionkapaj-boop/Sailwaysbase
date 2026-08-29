"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../../AuthContext";
import { listMyBookingsAsSkipper } from "../../../../lib/platform/db";
import MissingProfile from "../MissingProfile";
import AvailabilityCalendar from "../AvailabilityCalendar";
import BackButton from "../../components/BackButton";
import { container, h1, muted } from "../../../../lib/platform/theme";

export default function SkipperAvailabilityPage() {
  const { session, profile, userRow, loading, refresh, loadError, isAdmin } = useAuth();
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    if (profile?.id) listMyBookingsAsSkipper(profile.id).then(setBookings).catch(() => {});
  }, [profile?.id]);

  if (loading) return <div style={container}>Φόρτωση...</div>;
  if (!session) return <div style={container}>Χρειάζεται σύνδεση.</div>;
  if (userRow?.role !== "skipper" && !isAdmin)
    return <div style={container}>Αυτή η σελίδα είναι μόνο για επαγγελματίες.</div>;
  if (!profile) return <MissingProfile userRow={userRow} isAdmin={isAdmin} refresh={refresh} loadError={loadError} />;

  return (
    <div style={container}>
      <BackButton href="/platform/skipper" />
      <h1 style={{ ...h1, marginTop: 14 }}>Η διαθεσιμότητά μου</h1>
      {userRow?.role !== "skipper" && <p style={{ ...muted, marginTop: -8, marginBottom: 16 }}>ως επαγγελματίας</p>}

      {/* Available while pending too — no reason to wait for approval before
          saying when you can work. */}
      <div style={{ marginTop: 20 }}>
        <AvailabilityCalendar skipperId={profile.id} bookings={bookings} />
      </div>
    </div>
  );
}
