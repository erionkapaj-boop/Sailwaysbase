"use client";
import Link from "next/link";
import { useAuth } from "../../AuthContext";
import { MissingProfile } from "../page";
import ProfileForm from "../ProfileForm";
import { container, h1, muted } from "../../../../lib/platform/theme";

// Profile now lives behind the header's hamburger menu rather than as a card
// in the dashboard flow (dashboard v2 §3) — it's filled in once and rarely
// touched, so it doesn't need to compete with bookings/availability for
// space on the page a professional actually opens the app to use.
export default function SkipperProfilePage() {
  const { session, profile, userRow, loading, refresh, loadError } = useAuth();

  if (loading) return <div style={container}>Φόρτωση...</div>;
  if (!session) return <div style={container}>Χρειάζεται σύνδεση.</div>;
  if (userRow?.role !== "skipper") return <div style={container}>Αυτή η σελίδα είναι μόνο για skippers.</div>;
  if (!profile) return <MissingProfile userRow={userRow} refresh={refresh} loadError={loadError} />;

  return (
    <div style={container}>
      <Link href="/platform/skipper" style={{ ...muted, fontSize: 14, textDecoration: "none" }}>
        ← Πίσω στον πίνακα
      </Link>
      <h1 style={{ ...h1, marginTop: 14 }}>Το προφίλ μου</h1>
      <ProfileForm profile={profile} onSaved={refresh} />
    </div>
  );
}
