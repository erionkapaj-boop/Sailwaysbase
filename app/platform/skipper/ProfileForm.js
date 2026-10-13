"use client";
import MultiPick from "../components/MultiPick";
import { friendlyError } from "../../../lib/platform/friendlyError";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useLocalData } from "../useLocalData";
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

// Ημερομηνία γέννησης: τρεις επιλογές αντί για ημερολόγιο — κανείς δεν
// θέλει να γυρίσει σαράντα χρόνια πίσω μήνα-μήνα.
function DobSelect({ id, value, onChange }) {
  const t = useTranslations("ProfileForm");
  const [y0, m0, d0] = value ? value.split("-") : ["", "", ""];
  const [parts, setParts] = useState({ y: y0 || "", m: m0 || "", d: d0 || "" });
  useEffect(() => {
    const [y, m, d] = value ? value.split("-") : ["", "", ""];
    setParts((p) => (value ? { y, m, d } : p));
  }, [value]);
  const thisYear = new Date().getFullYear();
  const years = [];
  for (let y = thisYear - 18; y >= thisYear - 80; y--) years.push(String(y));
  const daysIn = parts.y && parts.m ? new Date(Number(parts.y), Number(parts.m), 0).getDate() : 31;
  function set(k, v) {
    const next = { ...parts, [k]: v };
    if (next.d && Number(next.d) > (next.y && next.m ? new Date(Number(next.y), Number(next.m), 0).getDate() : 31)) next.d = "";
    setParts(next);
    onChange(next.y && next.m && next.d ? `${next.y}-${next.m}-${next.d}` : "");
  }
  const sel = { ...select, flex: 1, minWidth: 0 };
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <select id={id} aria-label={t("day")} style={{ ...sel, flex: "0 0 84px" }} value={parts.d} onChange={(e) => set("d", e.target.value)}>
        <option value="">{t("day")}</option>
        {Array.from({ length: daysIn }, (_, i) => String(i + 1).padStart(2, "0")).map((d) => (
          <option key={d} value={d}>
            {Number(d)}
          </option>
        ))}
      </select>
      <select aria-label={t("month")} style={sel} value={parts.m} onChange={(e) => set("m", e.target.value)}>
        <option value="">{t("month")}</option>
        {Array.from({ length: 12 }, (_, i) => (
          <option key={i} value={String(i + 1).padStart(2, "0")}>
            {t(`month${i + 1}`)}
          </option>
        ))}
      </select>
      <select aria-label={t("year")} style={{ ...sel, flex: "0 0 96px" }} value={parts.y} onChange={(e) => set("y", e.target.value)}>
        <option value="">{t("year")}</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}

function Criterion({ met, children }) {
  const t = useTranslations("ProfileForm");
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14 }}>
      <span
        aria-label={met ? t("done") : t("missing")}
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: met ? colors.success : "transparent",
          border: met ? "none" : `1.5px solid ${colors.border}`,
          boxSizing: "border-box",
        }}
      >
        {met && (
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span style={{ color: met ? colors.ink : colors.inkSoft }}>{children}</span>
    </div>
  );
}

// Stored values of the gender field (profile data, kept as they are in the database);
// written as escapes so that no screen text sits in code. Same for the common-language names,
// which match the Greek names of the languages list.
const GENDERS = [
  { value: "\u0386\u03bd\u03b4\u03c1\u03b1\u03c2", key: "male" },
  { value: "\u0393\u03c5\u03bd\u03b1\u03af\u03ba\u03b1", key: "female" },
];
const COMMON_LANGUAGES = ["\u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac", "\u0391\u03b3\u03b3\u03bb\u03b9\u03ba\u03ac", "\u0393\u03b5\u03c1\u03bc\u03b1\u03bd\u03b9\u03ba\u03ac", "\u0393\u03b1\u03bb\u03bb\u03b9\u03ba\u03ac", "\u0399\u03c4\u03b1\u03bb\u03b9\u03ba\u03ac", "\u0399\u03c3\u03c0\u03b1\u03bd\u03b9\u03ba\u03ac"];

export default function ProfileForm({ profile, onSaved, availabilityVersion = 0 }) {
  const t = useTranslations("ProfileForm");
  const L = useLocalData();
  const [lookups, setLookups] = useState({ languages: [], boatTypes: [], ports: [], nationalities: [] });
  const [form, setForm] = useState({
    full_name: profile.full_name || "",
    gender: profile.gender || "",
    nationality_id: profile.nationality_id || "",
    photo_url: profile.photo_url || "",
    date_of_birth: profile.date_of_birth || "",
    price_per_day: profile.price_per_day || "",
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
      setError(t("errName"));
      return;
    }
    if (!form.photo_url) {
      setError(t("errPhoto"));
      return;
    }
    if (!form.gender) {
      setError(t("errGender"));
      return;
    }
    if (!form.nationality_id) {
      setError(t("errNationality"));
      return;
    }
    if (!form.date_of_birth) {
      setError(t("errDob"));
      return;
    }
    if (!(Number(form.price_per_day) > 0)) {
      setError(t("errPrice"));
      return;
    }
    if (languageIds.length === 0) {
      setError(t("errLanguage"));
      return;
    }
    if (isSkipper && boatTypeIds.length === 0) {
      setError(t("errBoatType"));
      return;
    }
    setSaved(false);
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
      setError(friendlyError(err));
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
  const hasPrice = Number(form.price_per_day) > 0;
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
          {visible ? t("visible") : t("notVisible")}
        </b>
        <p style={{ ...muted, fontSize: 13, margin: "6px 0 12px" }}>
          {t("allNeeded")}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Criterion met={isApproved}>{t("critApproval")}</Criterion>
          <Criterion met={hasPrice}>{t("critPrice")}</Criterion>
          <Criterion met={hasBoatTypes}>{t("critBoatTypes")}</Criterion>
          <Criterion met={hasAvailability}>{t("critAvailability")}</Criterion>
        </div>
        {!isApproved && (
          <p style={{ ...muted, fontSize: 12, margin: "12px 0 0" }}>
            {t("pendingApproval")}
          </p>
        )}
        {!hasBoatTypes && (
          <p style={{ ...muted, fontSize: 12, margin: "12px 0 0" }}>
            {t("pickBoatTypes")}
          </p>
        )}
        {!hasAvailability && (
          <p style={{ ...muted, fontSize: 12, margin: "12px 0 0" }}>
            {t.rich("declareAvailability", {
              link: (c) => (
                <Link href="/platform/availability" style={{ color: colors.ink }}>
                  {c}
                </Link>
              ),
            })}
          </p>
        )}
        {visible && !hasPhoto && (
          <p style={{ ...muted, fontSize: 12, margin: "12px 0 0" }}>
            {t("noPhoto")}
          </p>
        )}
      </div>

      <Section title={t("basics")}>
        <div style={{ marginBottom: 20 }}>
          <span style={label}>{t("photo")}</span>
          <PhotoUpload value={form.photo_url} onUploaded={(url) => setField("photo_url", url)} />
          {!form.photo_url && (
            <p style={{ ...muted, fontSize: 12, margin: "6px 0 0" }}>{t("photoNote")}</p>
          )}
        </div>

        <label style={label} htmlFor="p-name">
          {t("fullName")}
        </label>
        <input
          id="p-name"
          required
          style={{ ...input, marginBottom: isApproved && form.full_name.trim() !== (profile.full_name || "").trim() ? 6 : 16 }}
          value={form.full_name}
          onChange={(e) => setField("full_name", e.target.value)}
        />
        {isApproved && form.full_name.trim() !== (profile.full_name || "").trim() && (
          <p style={{ ...muted, fontSize: 12, color: colors.warn, margin: "0 0 16px" }}>
            {t("renameWarning")}
          </p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 14 }}>
          <div>
            <label style={label} htmlFor="p-gender">
              {t("gender")}
            </label>
            <select
              id="p-gender"
              required
              style={select}
              value={form.gender}
              onChange={(e) => setField("gender", e.target.value)}
            >
              <option value="">—</option>
              {GENDERS.map((g) => (
                <option key={g.key} value={g.value}>
                  {t(g.key)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="p-nationality">
              {t("nationality")}
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
                  {L.text(n.name)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="p-dob">
              {t("dob")}
            </label>
            <DobSelect id="p-dob" value={form.date_of_birth || ""} onChange={(v) => setField("date_of_birth", v)} />
          </div>
        </div>

        {highlights.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <span style={label}>{t("howYouAppear")}</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {highlights.map((h) => (
                <span key={h} style={{ ...badge("neutral"), fontFamily: "inherit", fontWeight: 400 }}>
                  {h}
                </span>
              ))}
            </div>
            <p style={{ ...muted, fontSize: 12, margin: "8px 0 0" }}>
              {t("autoDerived")}
            </p>
          </div>
        )}
      </Section>

      <Section title={t("priceTitle")} note={t("priceNote")}>
        <label style={label} htmlFor="p-price">
          {t("pricePerDay")}
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            id="p-price"
            type="number"
            min={1}
            required
            style={{ ...input, maxWidth: 160 }}
            value={form.price_per_day}
            onChange={(e) => setField("price_per_day", e.target.value)}
          />
          <span style={{ ...money, fontSize: 15 }}>{t("eurPerDay")}</span>
        </div>
      </Section>

      <Section title={t("languagesTitle")} note={t("languagesNote")}>
        <MultiPick
          label={t("languagesTitle")}
          placeholder={t("addLanguage")}
          options={lookups.languages}
          value={languageIds}
          common={COMMON_LANGUAGES}
          onChange={setLanguageIds}
        />
      </Section>

      {isSkipper && (
        <Section title={t("boatTypesTitle")} note={t("boatTypesNote")}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {lookups.boatTypes.map((b) => (
              <button
                type="button"
                key={b.id}
                style={chip(boatTypeIds.includes(b.id))}
                onClick={() => toggleIn(boatTypeIds, setBoatTypeIds, b.id)}
              >
                {L.text(b.name)}
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
            {busy ? t("saving") : t("saveProfile")}
          </button>
          {saved && <span style={{ color: colors.success, fontSize: 14 }}>{t("saved")}</span>}
        </div>
        {error && (
          <p style={{ color: colors.danger, fontSize: 13, margin: "8px auto 0", maxWidth: 960 }}>{error}</p>
        )}
      </div>
    </form>
  );
}
