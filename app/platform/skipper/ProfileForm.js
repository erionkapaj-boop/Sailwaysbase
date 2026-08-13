"use client";
import { useEffect, useState } from "react";
import {
  listLookups,
  updateSkipperProfile,
  setSkipperLookups,
  getSkipperLookups,
  hasFutureAvailability,
} from "../../../lib/platform/db";
import { computeCrewHighlights, labelForRole } from "../../../lib/platform/roles";
import PhotoUpload from "../components/PhotoUpload";
import {
  card,
  h2,
  muted,
  button,
  input,
  label,
  colors,
  radius,
  money,
  badge,
} from "../../../lib/platform/theme";

const MIN_PRICE = 210;

// Filled navy when selected, hairline outline when not.
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

function Section({ title, children, note }) {
  return (
    <div style={card}>
      <h2 style={{ ...h2, fontSize: 17 }}>{title}</h2>
      {note && <p style={{ ...muted, fontSize: 13, margin: "0 0 14px" }}>{note}</p>}
      {children}
    </div>
  );
}

function Criterion({ met, children }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 14 }}>
      <span style={{ color: met ? colors.success : colors.inkSoft, fontWeight: 600 }}>
        {met ? "✓" : "✗"}
      </span>
      <span style={{ color: met ? colors.ink : colors.inkSoft }}>{children}</span>
    </div>
  );
}

export default function ProfileForm({ profile, onSaved, availabilityVersion = 0 }) {
  const [lookups, setLookups] = useState({ languages: [], boatTypes: [], ports: [] });
  const [form, setForm] = useState({
    full_name: profile.full_name || "",
    gender: profile.gender || "",
    photo_url: profile.photo_url || "",
    years_experience: profile.years_experience || 0,
    price_per_day: profile.price_per_day || MIN_PRICE,
  });
  const [languageIds, setLanguageIds] = useState([]);
  const [boatTypeIds, setBoatTypeIds] = useState([]);
  const [portIds, setPortIds] = useState([]);
  const [hasAvailability, setHasAvailability] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const role = profile.role || "skipper";
  const isSkipper = role === "skipper";

  useEffect(() => {
    listLookups().then(setLookups).catch(() => {});
    getSkipperLookups(profile.id).then((r) => {
      setLanguageIds(r.languageIds);
      setBoatTypeIds(r.boatTypeIds);
      setPortIds(r.portIds);
    });
    // Availability now lives in its own editor; the banner reflects it rather
    // than assuming it's unset.
    hasFutureAvailability(profile.id).then(setHasAvailability).catch(() => {});
  }, [profile.id, availabilityVersion]);

  function toggleIn(list, setList, id) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
    setSaved(false);
  }

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    if (Number(form.price_per_day) < MIN_PRICE) {
      setError(`Η τιμή ανά ημέρα δεν μπορεί να είναι κάτω από ${MIN_PRICE}€.`);
      return;
    }
    setBusy(true);
    try {
      await updateSkipperProfile({
        ...form,
        price_per_day: Number(form.price_per_day),
        years_experience: Number(form.years_experience),
      });
      await setSkipperLookups(profile.id, { languageIds, boatTypeIds, portIds });
      setSaved(true);
      onSaved?.();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  // Three things decide whether this profile can be found by a client.
  const hasPhoto = Boolean(form.photo_url);
  const hasPrice = Number(form.price_per_day) >= MIN_PRICE;
  const visible = hasPhoto && hasPrice && hasAvailability;

  const highlights = computeCrewHighlights(
    { ...profile, years_experience: form.years_experience },
    { languageCount: languageIds.length }
  );

  return (
    // Bottom padding leaves room for the fixed save bar.
    <form onSubmit={handleSave} style={{ paddingBottom: 88 }}>
      <div
        style={{
          ...card,
          borderLeft: `3px solid ${visible ? colors.success : colors.warn}`,
        }}
      >
        <b style={{ fontWeight: 600, fontSize: 15 }}>
          {visible ? "Το προφίλ σου είναι ορατό" : "Το προφίλ σου δεν είναι ακόμα ορατό"}
        </b>
        <p style={{ ...muted, fontSize: 13, margin: "6px 0 12px" }}>
          Χρειάζονται και τα τρία για να σε βρίσκουν οι πελάτες.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Criterion met={hasPhoto}>Φωτογραφία</Criterion>
          <Criterion met={hasPrice}>Τιμή ανά ημέρα</Criterion>
          <Criterion met={hasAvailability}>Διαθεσιμότητα</Criterion>
        </div>
        {!hasAvailability && (
          <p style={{ ...muted, fontSize: 12, margin: "12px 0 0" }}>
            Δήλωσε διαθεσιμότητα πιο κάτω σε αυτή τη σελίδα.
          </p>
        )}
      </div>

      <Section title="Βασικά στοιχεία">
        <div style={{ marginBottom: 20 }}>
          <span style={label}>Φωτογραφία</span>
          <PhotoUpload value={form.photo_url} onUploaded={(url) => setField("photo_url", url)} />
        </div>

        <label style={label} htmlFor="p-name">
          Ονοματεπώνυμο
        </label>
        <input
          id="p-name"
          required
          style={{ ...input, marginBottom: 16 }}
          value={form.full_name}
          onChange={(e) => setField("full_name", e.target.value)}
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 14 }}>
          <div>
            <label style={label} htmlFor="p-gender">
              Φύλο
            </label>
            <select
              id="p-gender"
              style={input}
              value={form.gender}
              onChange={(e) => setField("gender", e.target.value)}
            >
              <option value="">—</option>
              <option value="Άνδρας">Άνδρας</option>
              <option value="Γυναίκα">Γυναίκα</option>
            </select>
          </div>
          <div>
            <label style={label} htmlFor="p-years">
              Χρόνια εμπειρίας
            </label>
            <input
              id="p-years"
              type="number"
              min={0}
              style={input}
              value={form.years_experience}
              onChange={(e) => setField("years_experience", e.target.value)}
            />
          </div>
        </div>

        {highlights.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <span style={label}>Πώς εμφανίζεσαι στους πελάτες</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {highlights.map((h) => (
                <span key={h} style={{ ...badge("neutral"), fontFamily: "inherit", fontWeight: 400 }}>
                  {h}
                </span>
              ))}
            </div>
            <p style={{ ...muted, fontSize: 12, margin: "8px 0 0" }}>
              Προκύπτουν αυτόματα από τα στοιχεία σου — δεν γράφονται χειροκίνητα.
            </p>
          </div>
        )}
      </Section>

      <Section title="Τιμή" note={`Ελάχιστη επιτρεπτή τιμή ${MIN_PRICE}€ ανά ημέρα.`}>
        <label style={label} htmlFor="p-price">
          Τιμή ανά ημέρα
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            id="p-price"
            type="number"
            min={MIN_PRICE}
            required
            style={{ ...input, maxWidth: 160 }}
            value={form.price_per_day}
            onChange={(e) => setField("price_per_day", e.target.value)}
          />
          <span style={{ ...money, fontSize: 15 }}>€ / ημέρα</span>
        </div>
      </Section>

      <Section title="Γλώσσες">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {lookups.languages.map((l) => (
            <button
              type="button"
              key={l.id}
              style={chip(languageIds.includes(l.id))}
              onClick={() => toggleIn(languageIds, setLanguageIds, l.id)}
            >
              {l.name}
            </button>
          ))}
        </div>
      </Section>

      {isSkipper && (
        <Section title="Τύποι σκαφών">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {lookups.boatTypes.map((b) => (
              <button
                type="button"
                key={b.id}
                style={chip(boatTypeIds.includes(b.id))}
                onClick={() => toggleIn(boatTypeIds, setBoatTypeIds, b.id)}
              >
                {b.name}
              </button>
            ))}
          </div>
        </Section>
      )}


      {/* Always reachable — the form is long enough that a save button at the
          bottom would mean scrolling past every section to use it. */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "12px 16px",
          background: "rgba(250,248,244,0.94)",
          backdropFilter: "blur(8px)",
          borderTop: `1px solid ${colors.border}`,
          zIndex: 20,
        }}
      >
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          <button type="submit" disabled={busy} style={{ ...button("primary"), flex: 1 }}>
            {busy ? "Αποθήκευση…" : "Αποθήκευση προφίλ"}
          </button>
          {saved && <span style={{ color: colors.success, fontSize: 14 }}>✓ Αποθηκεύτηκε</span>}
        </div>
        {error && (
          <p style={{ color: colors.danger, fontSize: 13, margin: "8px auto 0", maxWidth: 960 }}>{error}</p>
        )}
      </div>
    </form>
  );
}
