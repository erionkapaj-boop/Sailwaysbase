"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
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
  select,
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
  const [lookups, setLookups] = useState({ languages: [], boatTypes: [], ports: [], nationalities: [] });
  const [form, setForm] = useState({
    full_name: profile.full_name || "",
    gender: profile.gender || "",
    nationality_id: profile.nationality_id || "",
    photo_url: profile.photo_url || "",
    date_of_birth: profile.date_of_birth || "",
    price_per_day: profile.price_per_day || MIN_PRICE,
  });
  const [languageIds, setLanguageIds] = useState([]);
  const [boatTypeIds, setBoatTypeIds] = useState([]);
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
    // Στη φάση του στησίματος της πλατφόρμας θέλουμε πλήρη προφίλ — τίποτα
    // προαιρετικό. Ελέγχονται με τη σειρά που εμφανίζονται στη φόρμα, ώστε
    // το μήνυμα σφάλματος να δείχνει πάντα το πρώτο πράγμα που λείπει.
    if (!form.full_name.trim()) {
      setError("Συμπλήρωσε το ονοματεπώνυμο.");
      return;
    }
    if (!form.photo_url) {
      setError("Ανέβασε φωτογραφία προφίλ.");
      return;
    }
    if (!form.gender) {
      setError("Επίλεξε φύλο.");
      return;
    }
    if (!form.nationality_id) {
      setError("Επίλεξε εθνικότητα.");
      return;
    }
    if (!form.date_of_birth) {
      setError("Συμπλήρωσε ημερομηνία γέννησης.");
      return;
    }
    if (Number(form.price_per_day) < MIN_PRICE) {
      setError(`Η τιμή ανά ημέρα δεν μπορεί να είναι κάτω από ${MIN_PRICE}€.`);
      return;
    }
    if (languageIds.length === 0) {
      setError("Επίλεξε τουλάχιστον μία γλώσσα.");
      return;
    }
    if (isSkipper && boatTypeIds.length === 0) {
      setError("Επίλεξε τουλάχιστον έναν τύπο σκάφους.");
      return;
    }
    setBusy(true);
    try {
      await updateSkipperProfile({
        ...form,
        date_of_birth: form.date_of_birth || null,
        nationality_id: form.nationality_id || null,
        price_per_day: Number(form.price_per_day),
      });
      // No portIds: ports belong to availability windows now, and rewriting
      // the retired skipper_coverage_areas rows on every save achieved
      // nothing except keeping dead data alive.
      await setSkipperLookups(profile.id, { languageIds, boatTypeIds });
      setSaved(true);
      onSaved?.();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  // Αυτά είναι ΑΚΡΙΒΩΣ τα κριτήρια που εφαρμόζει η αναζήτηση
  // (search_available_skippers + skipper_public), όχι μια κατά προσέγγιση
  // εκδοχή τους: η λίστα έλεγε «χρειάζονται και τα τρία» ενώ ζητούσε
  // φωτογραφία (που η αναζήτηση ΔΕΝ ελέγχει) και παρέλειπε τους τύπους
  // σκάφους (που τους ελέγχει και χωρίς αυτούς κανείς δεν εμφανίζεται ποτέ).
  // Αποτέλεσμα: πράσινο «είσαι ορατός» σε κάποιον μόνιμα αόρατο.
  const hasPrice = Number(form.price_per_day) >= MIN_PRICE;
  // Ζητείται μόνο όπου προσφέρεται: η ενότητα «Τύποι σκαφών» εμφανίζεται μόνο
  // για skipper, οπότε σε άλλη ιδιότητα θα ήταν κριτήριο χωρίς κουμπί.
  const hasBoatTypes = !isSkipper || boatTypeIds.length > 0;
  const isApproved = profile.approval_status === "approved";
  const visible = hasPrice && hasBoatTypes && hasAvailability && isApproved;

  // Δεν κρύβει από την αναζήτηση, αλλά η κάρτα βγαίνει με κενό γκρι κύκλο
  // αντί για πρόσωπο — χωριστά, ως σύσταση, όχι ως προϋπόθεση.
  const hasPhoto = Boolean(form.photo_url);

  const highlights = computeCrewHighlights(profile, { languageCount: languageIds.length });

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
          Χρειάζονται όλα τα παρακάτω για να σε βρίσκουν οι πελάτες.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Criterion met={isApproved}>Έγκριση λογαριασμού</Criterion>
          <Criterion met={hasPrice}>Τιμή ανά ημέρα</Criterion>
          <Criterion met={hasBoatTypes}>Τύποι σκάφους</Criterion>
          <Criterion met={hasAvailability}>Διαθεσιμότητα</Criterion>
        </div>
        {!isApproved && (
          <p style={{ ...muted, fontSize: 12, margin: "12px 0 0" }}>
            Ο λογαριασμός σου περιμένει έγκριση από τη διαχείριση. Μέχρι τότε μπορείς να συμπληρώσεις
            τα υπόλοιπα κανονικά.
          </p>
        )}
        {!hasBoatTypes && (
          <p style={{ ...muted, fontSize: 12, margin: "12px 0 0" }}>
            Διάλεξε τουλάχιστον έναν τύπο σκάφους παρακάτω. Οι πελάτες ψάχνουν πάντα για συγκεκριμένο
            σκάφος — χωρίς αυτό δεν εμφανίζεσαι σε καμία αναζήτηση.
          </p>
        )}
        {!hasAvailability && (
          <p style={{ ...muted, fontSize: 12, margin: "12px 0 0" }}>
            Δήλωσε διαθεσιμότητα από το ημερολόγιο στον <Link href="/platform/skipper" style={{ color: colors.ink }}>πίνακά σου</Link>.
          </p>
        )}
        {visible && !hasPhoto && (
          <p style={{ ...muted, fontSize: 12, margin: "12px 0 0" }}>
            Δεν έχεις φωτογραφία. Εμφανίζεσαι κανονικά, αλλά η κάρτα σου βγαίνει χωρίς πρόσωπο —
            πρόσθεσε μία παρακάτω.
          </p>
        )}
      </div>

      <Section title="Βασικά στοιχεία">
        <div style={{ marginBottom: 20 }}>
          <span style={label}>Φωτογραφία</span>
          <PhotoUpload value={form.photo_url} onUploaded={(url) => setField("photo_url", url)} />
          {!form.photo_url && (
            <p style={{ ...muted, fontSize: 12, margin: "6px 0 0" }}>Υποχρεωτική.</p>
          )}
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
              required
              style={select}
              value={form.gender}
              onChange={(e) => setField("gender", e.target.value)}
            >
              <option value="">—</option>
              <option value="Άνδρας">Άνδρας</option>
              <option value="Γυναίκα">Γυναίκα</option>
            </select>
          </div>
          <div>
            <label style={label} htmlFor="p-nationality">
              Εθνικότητα
            </label>
            <select
              id="p-nationality"
              required
              style={select}
              value={form.nationality_id}
              onChange={(e) => setField("nationality_id", e.target.value)}
            >
              <option value="">—</option>
              {lookups.nationalities?.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="p-dob">
              Ημερομηνία γέννησης
            </label>
            <input
              id="p-dob"
              type="date"
              required
              style={input}
              value={form.date_of_birth || ""}
              onChange={(e) => setField("date_of_birth", e.target.value)}
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

      <Section title="Γλώσσες" note="Επίλεξε τουλάχιστον μία.">
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
        <Section title="Τύποι σκαφών" note="Επίλεξε τουλάχιστον έναν.">
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
