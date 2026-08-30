"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import MissingProfile from "../skipper/MissingProfile";
import ProfileForm from "../skipper/ProfileForm";
import PhotoUpload from "../components/PhotoUpload";
import {
  updateMyPhoto,
  listLookups,
  getMyClientProfile,
  updateClientProfile,
  getClientLanguages,
  setClientLanguages,
} from "../../../lib/platform/db";
import { container, card, h1, h2, muted, colors, radius, select, label, button } from "../../../lib/platform/theme";

const chip = (active) => ({
  padding: "9px 16px",
  borderRadius: radius.pill,
  fontSize: 14,
  fontFamily: "inherit",
  cursor: "pointer",
  transition: "background 0.15s ease, border-color 0.15s ease, color 0.15s ease",
  border: `1px solid ${active ? colors.ink : colors.border}`,
  background: active ? colors.ink : "transparent",
  color: active ? "#fff" : colors.ink,
});

// Ένας επαγγελματίας συμπληρώνει ΜΟΝΟ το επαγγελματικό του προφίλ — η
// φωτογραφία, η εθνικότητα και οι γλώσσες που βλέπει ένας πελάτης όταν τον
// προσλαμβάνει αντλούνται αυτόματα από εκεί (lib/platform/db.js,
// updateSkipperProfile/setSkipperLookups). Μόνο ένας απλός λογαριασμός
// πελάτη — χωρίς κανένα επαγγελματικό προφίλ να αντλήσει — συμπληρώνει αυτά
// τα στοιχεία εδώ ο ίδιος.
function ClientIdentityProfile({ role }) {
  const { session, userRow, refresh } = useAuth();
  const [lookups, setLookups] = useState({ nationalities: [], languages: [] });
  const [nationalityId, setNationalityId] = useState("");
  const [languageIds, setLanguageIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!session) return;
    listLookups().then(setLookups).catch(() => {});
    getMyClientProfile().then((p) => setNationalityId(p?.nationality_id || "")).catch(() => {});
    getClientLanguages(userRow?.id).then(setLanguageIds).catch(() => {});
  }, [session, userRow?.id]);

  async function handleUploaded(url) {
    await updateMyPhoto(url);
    await refresh();
  }

  function toggleLanguage(id) {
    setLanguageIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    setSaved(false);
  }

  async function handleSave() {
    setError("");
    setBusy(true);
    try {
      await updateClientProfile({ nationality_id: nationalityId || null });
      await setClientLanguages(userRow.id, languageIds);
      setSaved(true);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={container}>
      <h1 style={h1}>Το προφίλ μου</h1>
      {role && role !== "client" && <p style={{ ...muted, marginTop: -8, marginBottom: 16 }}>ως πελάτης</p>}

      <div style={card}>
        <h2 style={{ ...h2, fontSize: 17 }}>Φωτογραφία</h2>
        <p style={{ ...muted, fontSize: 13, margin: "0 0 14px" }}>
          Αυτή τη φωτογραφία βλέπει ο απέναντι — πελάτης ή επαγγελματίας — μόλις μια κράτηση επιβεβαιωθεί.
        </p>
        <PhotoUpload value={userRow?.photo_url} onUploaded={handleUploaded} />
      </div>

      <div style={card}>
        <h2 style={{ ...h2, fontSize: 17 }}>Εθνικότητα &amp; γλώσσες</h2>
        <p style={{ ...muted, fontSize: 13, margin: "0 0 14px" }}>
          Αυτά τα βλέπει ο επαγγελματίας πριν αποδεχτεί το αίτημά σου.
        </p>

        <label style={label} htmlFor="c-nationality">
          Εθνικότητα
        </label>
        <select
          id="c-nationality"
          style={{ ...select, marginBottom: 18 }}
          value={nationalityId}
          onChange={(e) => {
            setNationalityId(e.target.value);
            setSaved(false);
          }}
        >
          <option value="">—</option>
          {lookups.nationalities.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>

        <span style={label}>Γλώσσες</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {lookups.languages.map((l) => (
            <button
              type="button"
              key={l.id}
              style={chip(languageIds.includes(l.id))}
              onClick={() => toggleLanguage(l.id)}
            >
              {l.name}
            </button>
          ))}
        </div>

        <button type="button" disabled={busy} style={button("primary")} onClick={handleSave}>
          {busy ? "Αποθήκευση…" : saved ? "Αποθηκεύτηκε ✓" : "Αποθήκευση"}
        </button>
        {error && <p style={{ color: colors.danger, marginTop: 10, fontSize: 13 }}>{error}</p>}
      </div>

      <p style={{ ...muted, fontSize: 12.5, marginTop: 4, color: colors.inkSoft }}>
        Ονοματεπώνυμο και τηλέφωνο έρχονται από την εγγραφή σου και δεν αλλάζουν εδώ.
      </p>
    </div>
  );
}

export default function ProfilePage() {
  const { session, profile, userRow, loading, refresh, loadError, isAdmin, role } = useAuth();

  if (loading) return <div style={container}>Φόρτωση...</div>;
  if (!session) return <div style={container}>Χρειάζεται σύνδεση.</div>;

  const isProfessional = userRow?.role === "skipper" || isAdmin;
  if (!isProfessional) return <ClientIdentityProfile role={role} />;
  if (!profile) return <MissingProfile userRow={userRow} isAdmin={isAdmin} refresh={refresh} loadError={loadError} />;

  return (
    <div style={container}>
      <h1 style={h1}>Το προφίλ μου</h1>
      {userRow?.role !== "skipper" && <p style={{ ...muted, marginTop: -8, marginBottom: 16 }}>ως επαγγελματίας</p>}
      <ProfileForm profile={profile} onSaved={refresh} />
    </div>
  );
}
