"use client";
import { useTranslations } from "next-intl";
import { input, label, muted, colors } from "../../../lib/platform/theme";
import { boatValid } from "../../../lib/platform/boat";

// Στοιχεία σκάφους (0127): όλα προαιρετικά. Ο επαγγελματίας βλέπει τι σκάφος
// θα αναλάβει. value: { model, lengthFt, year }· onChange: (patch) => void.
export default function BoatFields({ value, onChange, idPrefix = "boat" }) {
  const t = useTranslations("Boat");
  const v = { model: "", lengthFt: "", year: "", ...value };
  const bad = !boatValid(v);
  const err = (on) => (on ? { ...input, border: `1px solid ${colors.danger}` } : input);
  return (
    <div data-boat-fields>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={label} htmlFor={`${idPrefix}-model`}>{t("modelLabel")}</label>
          <input id={`${idPrefix}-model`} type="text" maxLength={60} autoComplete="off" placeholder={t("modelPlaceholder")}
            style={input} value={v.model} onChange={(e) => onChange({ model: e.target.value })} />
        </div>
        <div>
          <label style={label} htmlFor={`${idPrefix}-length`}>{t("lengthLabel")}</label>
          <input id={`${idPrefix}-length`} type="text" inputMode="numeric" maxLength={3} autoComplete="off" placeholder="42"
            style={err(v.lengthFt && !(Number(v.lengthFt) >= 10 && Number(v.lengthFt) <= 300))} value={v.lengthFt} onChange={(e) => onChange({ lengthFt: e.target.value.replace(/\D/g, "") })} />
        </div>
        <div>
          <label style={label} htmlFor={`${idPrefix}-year`}>{t("yearLabel")}</label>
          <input id={`${idPrefix}-year`} type="text" inputMode="numeric" maxLength={4} autoComplete="off" placeholder="2019"
            style={err(v.year && !(Number(v.year) >= 1900 && Number(v.year) <= 2100))} value={v.year} onChange={(e) => onChange({ year: e.target.value.replace(/\D/g, "") })} />
        </div>
      </div>
      <p style={{ ...muted, fontSize: 12.5, margin: "6px 0 0", color: bad ? colors.danger : undefined }}>{bad ? t("invalid") : t("hint")}</p>
    </div>
  );
}
