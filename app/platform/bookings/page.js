"use client";
import { Suspense, useEffect, useState } from "react";
import LoadError from "../components/LoadError";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuth } from "../AuthContext";
import useActiveRole from "../useActiveRole";
import { listMyBookingsAsClient, listMyBookingsAsSkipper, listMyDeliveryBookings } from "../../../lib/platform/db";
import BookingPanel from "../components/BookingPanel";
import DeliveryBookingCard from "../components/DeliveryBookingCard";
import PendingReviewBanner from "../components/PendingReviewBanner";
import { container, card, h1, sectionLabel, muted, button } from "../../../lib/platform/theme";
import SignedOutNotice from "../components/SignedOutNotice";

export default function BookingsPage() {
  const t = useTranslations("Bookings");
  return (
    <Suspense fallback={<div style={container}>{t("loading")}</div>}>
      <BookingsInner />
    </Suspense>
  );
}

// useSearchParams() (για ?focus=<bookingId>, από το κουδουνάκι μηνυμάτων)
// χρειάζεται Suspense boundary γύρω του στο app router.
function BookingsInner() {
  const t = useTranslations("Bookings");
  const { session, userRow, profile, loading, notifications } = useAuth();
  const activeRole = useActiveRole();
  const searchParams = useSearchParams();
  const focusBookingId = searchParams.get("focus");
  const [clientBookings, setClientBookings] = useState([]);
  const [proBookings, setProBookings] = useState([]);
  const [deliveryBookings, setDeliveryBookings] = useState([]);
  const [busy, setBusy] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  // Κάθε δωμάτιο βλέπει μόνο τα δικά του: ο Επαγγελματίας τις κρατήσεις του ως επαγγελματίας, ο Πελάτης όσες έκλεισε ως πελάτης.
  const isProfessional = activeRole === "professional";

  async function load() {
    setBusy(true);
    setLoadFailed(false);
    try {
      const [cb, pb, db] = await Promise.all([
        isProfessional ? Promise.resolve([]) : listMyBookingsAsClient(),
        isProfessional && profile?.id ? listMyBookingsAsSkipper(profile.id) : Promise.resolve([]),
        listMyDeliveryBookings().catch(() => []),
      ]);
      setClientBookings(cb);
      setProBookings(pb);
      setDeliveryBookings(db);
    } catch (err) {
      console.error(err);
      setLoadFailed(true);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (session) load();
  }, [session, profile?.id, isProfessional]);

  if (loading) return <div style={container}>{t("loading")}</div>;
  if (!session) return <SignedOutNotice />;

  const unreadIds = notifications?.unreadBookingIds ?? [];
  // Οι μεταφορές σκάφους: του δωματίου μόνο (ως επαγγελματίας όσες ανέλαβε, ως πελάτης όσες ζήτησε).
  const deliveries = deliveryBookings.filter((b) => (isProfessional ? profile?.id && b.skipper_id === profile.id : b.client_id === userRow?.id));

  return (
    <div style={container}>
      <h1 style={{ ...h1, marginBottom: 24 }}>{t("title")}</h1>
      <PendingReviewBanner bookingsHref="/platform/bookings" />
      {!busy && loadFailed && <LoadError what={t("loadWhat")} onRetry={load} />}

      {deliveries.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <h2 style={sectionLabel}>{t("deliveries")}<span style={{ marginLeft: 8, opacity: 0.55 }}>{deliveries.length}</span></h2>
          {deliveries.map((b) => (
            <DeliveryBookingCard key={b.id} booking={b} />
          ))}
        </div>
      )}

      {isProfessional && (
        <div style={{ marginTop: 8, marginBottom: 32 }}>
          <h2 style={sectionLabel}>{t("asProfessional")}<span style={{ marginLeft: 8, opacity: 0.55 }}>{proBookings.length}</span></h2>
          {busy && <p style={muted}>{t("loading")}</p>}
          {!busy && !loadFailed && proBookings.length === 0 && <div style={{ ...card, textAlign: "center", padding: "20px 22px" }}><p style={{ ...muted, margin: 0 }}>{t("noBookings")}</p></div>}
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

      {!isProfessional && (
      <div>
        <h2 style={sectionLabel}>{t("asClient")}<span style={{ marginLeft: 8, opacity: 0.55 }}>{clientBookings.length}</span></h2>
        {busy && <p style={muted}>{t("loading")}</p>}
        {!busy && !loadFailed && clientBookings.length === 0 && (
          <div style={{ ...card, textAlign: "center" }}>
            <p style={{ ...muted, margin: "0 0 14px" }}>
              {t("clientEmpty")}
            </p>
            <Link href="/platform" style={{ ...button("secondary"), textDecoration: "none" }}>
              {t("findCrew")}
            </Link>
          </div>
        )}
        {clientBookings.map((b) => (
          <BookingPanel
            key={b.id}
            booking={b}
            replacedBy={clientBookings.find((x) => x.replaces_booking_id === b.id && x.status !== "cancelled_by_skipper") || null}
            supersededBy={clientBookings.find((x) => x.replaces_booking_id === b.id && x.status === "cancelled_by_skipper") || null}
            viewerRole="client"
            viewerUserId={userRow.id}
            onChanged={load}
            autoExpand={b.id === focusBookingId}
            hasUnread={unreadIds.includes(b.id)}
          />
        ))}
      </div>
      )}
    </div>
  );
}
