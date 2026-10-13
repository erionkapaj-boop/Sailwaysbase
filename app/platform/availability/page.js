"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import LoadError from "../components/LoadError";
import { useAuth } from "../AuthContext";
import { listMyBookingsAsSkipper } from "../../../lib/platform/db";
import MissingProfile from "../skipper/MissingProfile";
import AvailabilityCalendar from "../skipper/AvailabilityCalendar";
import { container, h1, muted } from "../../../lib/platform/theme";
import SignedOutNotice from "../components/SignedOutNotice";

export default function AvailabilityPage() {
  const t = useTranslations("AvailabilityPage");
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

  if (loading) return <div style={container}>{t("loading")}</div>;
  if (!session) return <SignedOutNotice />;
  if (userRow?.role !== "skipper" && !isAdmin)
    return <div style={container}>{t("professionalsOnly")}</div>;
  if (!profile) return <MissingProfile userRow={userRow} isAdmin={isAdmin} refresh={refresh} loadError={loadError} />;

  return (
    <div style={container}>
      <h1 style={h1}>{t("title")}</h1>
      {userRow?.role !== "skipper" && <p style={{ ...muted, marginTop: -8, marginBottom: 16 }}>{t("asProfessional")}</p>}
      <div style={{ marginTop: 20 }}>
        {bookingsFailed && <LoadError what={t("loadWhat")} onRetry={loadBookings} />}
        <AvailabilityCalendar skipperId={profile.id} bookings={bookings} />
      </div>
    </div>
  );
}
