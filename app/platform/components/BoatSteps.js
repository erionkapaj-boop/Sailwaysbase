"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { KINDS, boatName, inferFeet, modelsFor, searchBrands, searchModels } from "../../../lib/platform/boatCatalog";
import { button, colors, input, muted, radius } from "../../../lib/platform/theme";
import Icon from "./Icon";

// Τρία βήματα της ροής για τον σκάφος (μετά τον τύπο): μάρκα → μοντέλο → πόδια.
// Ένα πάτημα σε chip ή πρόταση προχωρά αμέσως· ελεύθερο κείμενο με «Συνέχεια»·
// όλα προαιρετικά («Παράλειψη»). Τα δεδομένα βρίσκονται στο lib/platform/boatCatalog.js.
const cta = { ...button("primary"), width: "100%", height: 52, padding: "0 18px", fontSize: 16, borderRadius: 12 };

const chipStyle = {
  padding: "10px 16px", borderRadius: radius.pill, fontSize: 15, fontFamily: "inherit", cursor: "pointer",
  border: `1px solid ${colors.border}`, background: colors.card, color: colors.ink, minHeight: 44,
};
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
        <button type="button" onClick={onSkip} style={{ ...button("secondary"), width: "100%", height: 52, borderRadius: 12 }}>{t("skip")}</button>
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
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

export function BrandStep({ kind, brand, setBrand, onNext }) {
  const t = useTranslations("CrewSearchFlow");
  const [text, setText] = useState(brand);
  const pick = (b) => {
    setBrand(b);
    onNext();
  };
  return (
    <div>
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
      {brand && <p style={{ ...muted, margin: "0 0 12px", fontSize: 14 }}>{brand}</p>}
      <PickField
        value={text} onChange={(v) => { setText(v); setModel(v.trim()); }} chips={modelsFor(brand, kind).slice(0, 8)}
        suggestions={(q) => searchModels(q, brand, kind)} placeholder={t("modelPlaceholder")} ariaLabel={t("modelTitle")} onPick={pick}
      />
      <Footer canContinue={Boolean(text.trim())} onNext={onNext} onSkip={() => { setModel(""); onNext(); }} />
    </div>
  );
}

export function FeetStep({ brand, model, feet, setFeet, onNext }) {
  const t = useTranslations("CrewSearchFlow");
  const guess = feet ? null : inferFeet(brand, model);
  const bad = feet && !(Number(feet) >= 10 && Number(feet) <= 300);
  return (
    <div>
      {(brand || model) && <p style={{ ...muted, margin: "0 0 12px", fontSize: 14 }}>{boatName(brand, model)}</p>}
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
        <div style={{ marginTop: 14 }}>
          <button type="button" style={chipStyle} onClick={() => setFeet(String(guess))}>{t("feetGuess", { n: guess })}</button>
        </div>
      )}
      <Footer canContinue={Boolean(feet) && !bad} onNext={onNext} onSkip={onNext} />
    </div>
  );
}
