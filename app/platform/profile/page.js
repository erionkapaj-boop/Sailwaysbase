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
  getMySecondaryRoles,
  addSecondaryRole,
  updateSecondaryRole,
  removeSecondaryRole,
} from "../../../lib/platform/db";
import { CREW_ROLES, labelForRole } from "../../../lib/platform/roles";
import { container, card, h1, h2, muted, colors, radius, select, label, button, input } from "../../../lib/platform/theme";

const MIN_PRICE = 210;

// "Έγκριση σε εκκρεμότητα" vs "Εγκρίθηκε" vs "Δεν εγκρίθηκε" — a secondary
// role goes through the same admin review as the main profile (0065), so it
// needs the same three-state story, just compressed into one line per role
// instead of its own page.
function statusLabel(role) {
  if (role.deleted_at) return { text: "Δεν εγκρίθηκε", color: colors.danger };
  if (role.approval_status === "approved") return { text: "Εγκρίθηκε", color: colors.success || colors.accent };
  return { text: "Σε αναμονή έγκρισης", color: colors.warn || colors.inkSoft };
}

// A second (third...) specialty on the same account — its own price and,
// for skipper, its own license, but everything else (photo, languages,
// nationality) stays the one already on the main profile above; no reason
// to ask for it twice. Ratings are kept separate per role on the database
// side (0065) — working as cook doesn't touch the skipper rating and vice
// versa.
function SecondaryRoles({ profile }) {
  const [roles, setRoles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [newRole, setNewRole] = useState("");
  const [newPrice, setNewPrice] = useState(String(MIN_PRICE));
  const [newLicenseNumber, setNewLicenseNumber] = useState("");
  const [newLicenseType, setNewLicenseType] = useState("");

  async function load() {
    try {
      setRoles(await getMySecondaryRoles(profile.id));
    } catch (err) {
      setError(err.message || String(err));
    }
  }
  useEffect(() => {
    if (profile?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const takenRoles = new Set([profile.role, ...roles.map((r) => r.role)]);
  const availableRoles = CREW_ROLES.filter((r) => r.supported && !takenRoles.has(r.key));

  async function handleAdd() {
    setError("");
    if (!newRole) return;
    if (Number(newPrice) < MIN_PRICE) {
      setError(`Η τιμή πρέπει να είναι τουλάχιστον ${MIN_PRICE}€.`);
      return;
    }
    setBusy(true);
    try {
      await addSecondaryRole(profile.id, {
        role: newRole,
        pricePerDay: Number(newPrice),
        licenseNumber: newRole === "skipper" ? newLicenseNumber.trim() : "",
        licenseType: newRole === "skipper" ? newLicenseType.trim() : "",
      });
      setAdding(false);
      setNewRole("");
      setNewPrice(String(MIN_PRICE));
      setNewLicenseNumber("");
      setNewLicenseType("");
      await load();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handlePriceChange(id, value) {
    setRoles((rs) => rs.map((r) => (r.id === id ? { ...r, price_per_day: value } : r)));
  }

  async function handlePriceSave(id, value) {
    if (Number(value) < MIN_PRICE) {
      setError(`Η τιμή πρέπει να είναι τουλάχιστον ${MIN_PRICE}€.`);
      return;
    }
    try {
      await updateSecondaryRole(id, { pricePerDay: Number(value) });
    } catch (err) {
      setError(err.message || String(err));
      await load();
    }
  }

  async function handleRemove(id) {
    setBusy(true);
    try {
      await removeSecondaryRole(id);
      await load();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    // ProfileForm's own save bar is fixed to the bottom of the viewport
    // (see its 88px paddingBottom) — this section renders after that form
    // closes, so it needs the same clearance or its own buttons end up
    // hidden behind that bar once someone scrolls this far down.
    <div style={{ ...card, marginBottom: 88 }}>
      <h2 style={{ ...h2, fontSize: 17 }}>Επιπλέον ρόλοι</h2>
      <p style={{ ...muted, fontSize: 13, margin: "0 0 14px" }}>
        Δούλεψε και σε άλλη ειδικότητα με τον ίδιο λογαριασμό — π.χ. skipper ΚΑΙ μάγειρας. Κάθε ρόλος έχει δική του
        τιμή και δική του αξιολόγηση· ποτέ δεν μπορείς να αναλάβεις δύο ρόλους στο ίδιο ταξίδι, αλλά τίποτα δεν σε
        εμποδίζει να δουλέψεις διαφορετικό ρόλο άλλη βδομάδα.
      </p>

      {error && <p style={{ color: colors.danger, fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {roles.map((r) => {
        const st = statusLabel(r);
        return (
          <div
            key={r.id}
            style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 0", borderTop: `1px solid ${colors.border}` }}
          >
            <div style={{ minWidth: 100, fontWeight: 600 }}>{labelForRole(r.role)}</div>
            <input
              type="number"
              min={MIN_PRICE}
              style={{ ...input, width: 90 }}
              value={r.price_per_day}
              onChange={(e) => handlePriceChange(r.id, e.target.value)}
              onBlur={(e) => handlePriceSave(r.id, e.target.value)}
              disabled={busy}
            />
            <span style={{ ...muted, fontSize: 13 }}>€/ημέρα</span>
            <span style={{ fontSize: 12.5, color: st.color, marginLeft: "auto" }}>{st.text}</span>
            <button type="button" style={{ ...button("secondary"), padding: "6px 12px", fontSize: 13 }} disabled={busy} onClick={() => handleRemove(r.id)}>
              Αφαίρεση
            </button>
          </div>
        );
      })}

      {adding ? (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${colors.border}` }}>
          <label style={label}>Ρόλος</label>
          <select style={{ ...select, marginBottom: 12 }} value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            <option value="">Επιλογή...</option>
            {availableRoles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>

          <label style={label}>Τιμή ανά ημέρα (€)</label>
          <input
            type="number"
            min={MIN_PRICE}
            style={{ ...input, marginBottom: 12, maxWidth: 160 }}
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
          />

          {newRole === "skipper" && (
            <>
              <label style={label}>Αριθμός άδειας</label>
              <input
                type="text"
                style={{ ...input, marginBottom: 12 }}
                value={newLicenseNumber}
                onChange={(e) => setNewLicenseNumber(e.target.value)}
              />
              <label style={label}>Τύπος άδειας</label>
              <input
                type="text"
                style={{ ...input, marginBottom: 12 }}
                value={newLicenseType}
                onChange={(e) => setNewLicenseType(e.target.value)}
              />
            </>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={button("primary")} disabled={busy || !newRole} onClick={handleAdd}>
              {busy ? "Αποθήκευση…" : "Προσθήκη ρόλου"}
            </button>
            <button type="button" style={button("secondary")} onClick={() => setAdding(false)}>
              Άκυρο
            </button>
          </div>
        </div>
      ) : availableRoles.length > 0 ? (
        <button type="button" style={{ ...button("secondary"), marginTop: roles.length > 0 ? 14 : 0 }} onClick={() => setAdding(true)}>
          + Προσθήκη ρόλου
        </button>
      ) : (
        roles.length === 0 && <p style={{ ...muted, fontSize: 13 }}>Καλύπτεις ήδη όλους τους διαθέσιμους ρόλους.</p>
      )}
    </div>
  );
}

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
      <SecondaryRoles profile={profile} />
    </div>
  );
}
