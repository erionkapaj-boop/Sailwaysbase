"use client";
import { useEffect, useState } from "react";
import {
  listLookups,
  updateSkipperProfile,
  setSkipperLookups,
  getSkipperLookups,
} from "../../../lib/platform/db";
import { card, h2, muted, button, input, label, colors } from "../../../lib/platform/theme";

const BIO_TAGS = [
  ["family_friendly", "Οικογενειακός"],
  ["fishing", "Ψάρεμα"],
  ["diving", "Καταδύσεις"],
  ["party", "Party sailing"],
  ["long_range", "Μεγάλες αποστάσεις"],
  ["islands_expert", "Ειδικός σε νησιά"],
];

export default function ProfileForm({ profile, onSaved }) {
  const [lookups, setLookups] = useState({ languages: [], boatTypes: [], ports: [] });
  const [form, setForm] = useState({
    full_name: profile.full_name || "",
    license_number: profile.license_number?.startsWith("PENDING-") ? "" : profile.license_number || "",
    license_type: profile.license_type || "",
    gender: profile.gender || "",
    photo_url: profile.photo_url || "",
    years_experience: profile.years_experience || 0,
    price_per_day: profile.price_per_day || 210,
    bio: Array.isArray(profile.bio) ? profile.bio : [],
  });
  const [languageIds, setLanguageIds] = useState([]);
  const [boatTypeIds, setBoatTypeIds] = useState([]);
  const [portIds, setPortIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    listLookups().then(setLookups).catch(() => {});
    getSkipperLookups(profile.id).then((r) => {
      setLanguageIds(r.languageIds);
      setBoatTypeIds(r.boatTypeIds);
      setPortIds(r.portIds);
    });
  }, [profile.id]);

  function toggleIn(list, setList, id) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    if (Number(form.price_per_day) < 210) {
      setError("Η τιμή/ημέρα δεν μπορεί να είναι κάτω από 210€.");
      return;
    }
    setBusy(true);
    try {
      await updateSkipperProfile({ ...form, price_per_day: Number(form.price_per_day), years_experience: Number(form.years_experience) });
      await setSkipperLookups(profile.id, { languageIds, boatTypeIds, portIds });
      setSaved(true);
      onSaved?.();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSave} style={card}>
      <h2 style={h2}>Προφίλ Skipper</h2>
      <p style={muted}>
        Το δίπλωμα + ονοματεπώνυμο λειτουργούν ως μόνιμο αναγνωριστικό — δεν αλλάζουν μετά την έγκριση.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 10, marginTop: 10 }}>
        <div>
          <label style={label}>Ονοματεπώνυμο</label>
          <input style={input} required value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
        </div>
        <div>
          <label style={label}>Αριθμός διπλώματος</label>
          <input
            style={input}
            required
            value={form.license_number}
            onChange={(e) => setForm((f) => ({ ...f, license_number: e.target.value }))}
          />
        </div>
        <div>
          <label style={label}>Τύπος διπλώματος</label>
          <input style={input} required value={form.license_type} onChange={(e) => setForm((f) => ({ ...f, license_type: e.target.value }))} />
        </div>
        <div>
          <label style={label}>Φύλο</label>
          <select style={input} value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}>
            <option value="">—</option>
            <option value="Άνδρας">Άνδρας</option>
            <option value="Γυναίκα">Γυναίκα</option>
          </select>
        </div>
        <div>
          <label style={label}>Χρόνια εμπειρίας</label>
          <input
            type="number"
            style={input}
            value={form.years_experience}
            onChange={(e) => setForm((f) => ({ ...f, years_experience: e.target.value }))}
          />
        </div>
        <div>
          <label style={label}>Τιμή/ημέρα (min 210€)</label>
          <input
            type="number"
            min={210}
            style={input}
            value={form.price_per_day}
            onChange={(e) => setForm((f) => ({ ...f, price_per_day: e.target.value }))}
          />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={label}>Φωτογραφία (URL)</label>
          <input style={input} value={form.photo_url} onChange={(e) => setForm((f) => ({ ...f, photo_url: e.target.value }))} />
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={label}>Βιογραφικό (δομημένες ετικέτες — όχι ελεύθερο κείμενο)</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {BIO_TAGS.map(([key, lbl]) => (
            <button
              type="button"
              key={key}
              onClick={() => toggleIn(form.bio, (v) => setForm((f) => ({ ...f, bio: v })), key)}
              style={button(form.bio.includes(key) ? "primary" : "secondary")}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={label}>Γλώσσες</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {lookups.languages.map((l) => (
            <button
              type="button"
              key={l.id}
              onClick={() => toggleIn(languageIds, setLanguageIds, l.id)}
              style={button(languageIds.includes(l.id) ? "primary" : "secondary")}
            >
              {l.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={label}>Τύποι σκαφών</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {lookups.boatTypes.map((b) => (
            <button
              type="button"
              key={b.id}
              onClick={() => toggleIn(boatTypeIds, setBoatTypeIds, b.id)}
              style={button(boatTypeIds.includes(b.id) ? "primary" : "secondary")}
            >
              {b.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={label}>Περιοχές κάλυψης</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {lookups.ports.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => toggleIn(portIds, setPortIds, p.id)}
              style={button(portIds.includes(p.id) ? "primary" : "secondary")}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {error && <p style={{ color: colors.danger, marginTop: 10 }}>{error}</p>}
      {saved && <p style={{ color: colors.success, marginTop: 10 }}>✓ Αποθηκεύτηκε</p>}
      <button style={{ ...button("primary"), marginTop: 14 }} disabled={busy} type="submit">
        {busy ? "Αποθήκευση..." : "Αποθήκευση προφίλ"}
      </button>
    </form>
  );
}
