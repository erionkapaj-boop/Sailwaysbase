"use client";
import Link from "next/link";
import { useAuth } from "../../AuthContext";
import PhotoUpload from "../../components/PhotoUpload";
import { updateMyPhoto } from "../../../../lib/platform/db";
import { container, card, h1, h2, muted, colors } from "../../../../lib/platform/theme";

// One personal photo per account, shown to whoever you're booked with —
// separate from a professional's skipper_profiles photo (their curated
// presentation for search results). Every signed-in account gets this page:
// a client, a professional acting as a client, or the admin doing either.
export default function MyPhotoPage() {
  const { session, userRow, loading, refresh } = useAuth();

  if (loading) return <div style={container}>Φόρτωση...</div>;
  if (!session) return <div style={container}>Χρειάζεται σύνδεση.</div>;

  async function handleUploaded(url) {
    await updateMyPhoto(url);
    await refresh();
  }

  return (
    <div style={container}>
      <Link href="/platform" style={{ ...muted, fontSize: 14, textDecoration: "none" }}>
        ← Πίσω
      </Link>
      <h1 style={{ ...h1, marginTop: 14 }}>Το προφίλ μου</h1>

      <div style={card}>
        <h2 style={{ ...h2, fontSize: 17 }}>Φωτογραφία</h2>
        <p style={{ ...muted, fontSize: 13, margin: "0 0 14px" }}>
          Αυτή τη φωτογραφία βλέπει ο απέναντι — πελάτης ή επαγγελματίας — μόλις μια κράτηση επιβεβαιωθεί.
        </p>
        <PhotoUpload value={userRow?.photo_url} onUploaded={handleUploaded} />
      </div>

      <p style={{ ...muted, fontSize: 12.5, marginTop: 4, color: colors.inkSoft }}>
        Ονοματεπώνυμο και τηλέφωνο έρχονται από την εγγραφή σου και δεν αλλάζουν εδώ.
      </p>
    </div>
  );
}
