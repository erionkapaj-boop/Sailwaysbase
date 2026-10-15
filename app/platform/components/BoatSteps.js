"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { KINDS, boatName, inferFeet, modelsFor, searchBrands, searchModels } from "../../../lib/platform/boatCatalog";
import { button, colors, input, muted, radius } from "../../../lib/platform/theme";
import Icon, { BOAT_ICON } from "./Icon";
import { boatImage } from "../../../lib/platform/boatImages";

// Τρία βήματα της ροής για τον σκάφος (μετά τον τύπο): μάρκα → μοντέλο → πόδια.
// Ένα πάτημα σε chip ή πρόταση προχωρά αμέσως· ελεύθερο κείμενο με «Συνέχεια»·
// όλα προαιρετικά («Παράλειψη»). Τα δεδομένα βρίσκονται στο lib/platform/boatCatalog.js.
const cta = { ...button("primary"), width: "100%", height: 52, padding: "0 18px", fontSize: 16, borderRadius: 12 };

// Επιλογές σε ισόπλατο πλέγμα δύο στηλών (όχι chips ανομοιόμορφου πλάτους).
const chipStyle = {
  padding: "10px 12px", borderRadius: radius.md, fontSize: 15, fontFamily: "inherit", cursor: "pointer", textAlign: "center", lineHeight: 1.25,
  border: `1px solid ${colors.border}`, background: colors.card, color: colors.ink, minHeight: 52, width: "100%", overflowWrap: "anywhere",
};
const gridStyle = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
const rowStyle = {
  display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", minHeight: 52, padding: "10px 16px",
  background: "transparent", border: 0, borderTop: `1px solid #F1EEE8`, font: "inherit", fontSize: 15.5, textAlign: "left", cursor: "pointer", color: colors.ink,
};

function Footer({ canContinue, onNext, onSkip }) {
  const t = useTranslations("CrewSearchFlow");
  return (
    <div className="sf-step-footer">
      {canContinue ? (
        <button type="button" onClick={onNext} style={cta}>{t("continue")}</button>
      ) : (
        <button type="button" onClick={onSkip} style={{ display: "block", margin: "0 auto", minHeight: 44, padding: "8px 16px", background: "none", border: 0, font: "inherit", fontSize: 15, color: colors.inkSoft, cursor: "pointer" }}>{t("skip")}</button>
      )}
    </div>
  );
}

// Πεδίο με chips (όταν είναι άδειο) ή προτάσεις (όταν γράφει) και ελεύθερο κείμενο.
function PickField({ value, onChange, chips, suggestions, placeholder, onPick, ariaLabel }) {
  const t = useTranslations("CrewSearchFlow");
  const q = value.trim();
  const sugg = q ? suggestions(q) : [];
  const exact = sugg.some((s) => s.toLowerCase() === q.toLowerCase());
  return (
    <div>
      <label style={{ position: "relative", display: "block" }}>
        <span style={{ position: "absolute", left: 14, top: 0, bottom: 0, display: "flex", alignItems: "center", color: colors.inkSoft }}>
          <Icon name="search" size={18} />
        </span>
        <input
          type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={ariaLabel}
          maxLength={60} autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="done"
          style={{ ...input, paddingLeft: 42, height: 52, borderRadius: 12 }}
        />
      </label>
      {!q && chips.length > 0 && (
        <div style={{ ...gridStyle, marginTop: 16 }}>
          {chips.map((c) => (
            <button key={c} type="button" style={chipStyle} onClick={() => onPick(c)}>{c}</button>
          ))}
        </div>
      )}
      {q && (
        <div role="listbox" style={{ marginTop: 10, border: `1px solid ${colors.border}`, borderRadius: 14, background: colors.card, overflow: "hidden" }}>
          {sugg.map((s, i) => (
            <button key={s} type="button" role="option" aria-selected="false" style={{ ...rowStyle, borderTop: i === 0 ? 0 : rowStyle.borderTop }} onClick={() => onPick(s)}>
              <span style={{ fontWeight: 500 }}>{s}</span>
            </button>
          ))}
          {!exact && (
            <button type="button" style={{ ...rowStyle, borderTop: sugg.length ? rowStyle.borderTop : 0, color: colors.inkSoft, fontSize: 14.5 }} onClick={() => onPick(q)}>
              {t("useText", { text: q })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Εικόνα του σκάφους: φωτογραφία του μοντέλου αν υπάρχει, αλλιώς η ενδεικτική εικόνα AI του
// καταλόγου (με ορατή ένδειξη), αλλιώς η σχηματική σιλουέτα του τύπου.
function BoatPicture({ kind, brand, model, title }) {
  const t = useTranslations("BoatPicture");
  const img = model ? boatImage(brand, model) : null;
  return (
    <div style={{ marginBottom: 16, borderRadius: radius.md, background: colors.seaGlass, overflow: "hidden", color: colors.ink }}>
      {img ? (
        <div style={{ position: "relative", height: 150 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.src} alt={img.illustrative ? t("alt") : title} loading="lazy" width={800} height={600} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
          {img.illustrative && (
            <span style={{ position: "absolute", left: 8, bottom: 8, fontSize: 11.5, fontWeight: 500, padding: "3px 8px", borderRadius: 999, background: "rgba(255,255,255,0.92)", color: colors.ink }}>
              {t("caption")}
            </span>
          )}
        </div>
      ) : (
        <div style={{ height: 112, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={BOAT_ICON[kind] || "sail"} size={52} stroke={1.3} />
        </div>
      )}
      {title && <div style={{ padding: "8px 12px 12px", textAlign: "center", fontSize: 14, fontWeight: 600 }}>{title}</div>}
    </div>
  );
}

export function BrandStep({ kind, brand, setBrand, onNext }) {
  const t = useTranslations("CrewSearchFlow");
  const [text, setText] = useState(brand);
  const pick = (b) => {
    setBrand(b);
    onNext();
  };
  return (
    <div>
      <BoatPicture kind={kind} brand="" model="" title="" />
      <PickField
        value={text} onChange={(v) => { setText(v); setBrand(v.trim()); }} chips={KINDS[kind] || []}
        suggestions={(q) => searchBrands(q, kind)} placeholder={t("brandPlaceholder")} ariaLabel={t("brandTitle")} onPick={pick}
      />
      <Footer canContinue={Boolean(text.trim())} onNext={onNext} onSkip={() => { setBrand(""); onNext(); }} />
    </div>
  );
}

export function ModelStep({ kind, brand, model, setModel, onNext }) {
  const t = useTranslations("CrewSearchFlow");
  const [text, setText] = useState(model);
  const pick = (m) => {
    setModel(m);
    onNext();
  };
  return (
    <div>
      <BoatPicture kind={kind} brand={brand} model="" title={brand} />
      <PickField
        value={text} onChange={(v) => { setText(v); setModel(v.trim()); }} chips={modelsFor(brand, kind).slice(0, 8)}
        suggestions={(q) => searchModels(q, brand, kind)} placeholder={t("modelPlaceholder")} ariaLabel={t("modelTitle")} onPick={pick}
      />
      <Footer canContinue={Boolean(text.trim())} onNext={onNext} onSkip={() => { setModel(""); onNext(); }} />
    </div>
  );
}

export function FeetStep({ kind, brand, model, feet, setFeet, onNext }) {
  const t = useTranslations("CrewSearchFlow");
  const guess = feet ? null : inferFeet(brand, model);
  const bad = feet && !(Number(feet) >= 10 && Number(feet) <= 300);
  return (
    <div>
      <BoatPicture kind={kind} brand={brand} model={model} title={boatName(brand, model)} />
      <div style={{ position: "relative" }}>
        <input
          type="text" inputMode="numeric" maxLength={3} autoComplete="off" autoFocus value={feet} placeholder="42" aria-label={t("feetTitle")}
          onChange={(e) => setFeet(e.target.value.replace(/\D/g, ""))}
          style={{ ...input, height: 56, fontSize: 20, borderRadius: 12, paddingRight: 70, borderColor: bad ? colors.danger : undefined }}
        />
        <span style={{ position: "absolute", right: 16, top: 0, bottom: 0, display: "flex", alignItems: "center", color: colors.inkSoft }}>{t("feetUnit")}</span>
      </div>
      {bad && <p style={{ ...muted, color: colors.danger, fontSize: 13, margin: "8px 0 0" }}>{t("feetInvalid")}</p>}
      {guess && (
        <div style={{ ...gridStyle, marginTop: 16 }}>
          <button type="button" style={chipStyle} onClick={() => setFeet(String(guess))}>{t("feetGuess", { n: guess })}</button>
        </div>
      )}
      <Footer canContinue={Boolean(feet) && !bad} onNext={onNext} onSkip={onNext} />
    </div>
  );
}
