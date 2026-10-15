"use client";
import { useTranslations } from "next-intl";
import { colors } from "../../../lib/platform/theme";
import Icon from "./Icon";

// Μεγάλος μετρητής −/+ με τον αριθμό στη μέση. Επαναχρησιμοποιείται σε κάθε οθόνη
// που ζητά ποσότητα (επιβάτες, κ.λπ.).
const btn = (disabled) => ({
  width: 64, height: 64, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
  border: `1px solid ${colors.border}`, background: colors.card, color: colors.ink, cursor: disabled ? "default" : "pointer",
  opacity: disabled ? 0.4 : 1, padding: 0, flexShrink: 0,
});

export default function Counter({ value, onChange, min = 1, max = 50, ariaValue }) {
  const t = useTranslations("Counter");
  const n = Number(value) || min;
  return (
    <div data-counter style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 28 }}>
      <button type="button" aria-label={t("less")} disabled={n <= min} onClick={() => onChange(Math.max(min, n - 1))} style={btn(n <= min)}>
        <Icon name="minus" size={26} stroke={2} />
      </button>
      <output aria-live="polite" aria-label={ariaValue} style={{ minWidth: 84, textAlign: "center", fontSize: 56, fontWeight: 600, letterSpacing: "-0.02em", color: colors.ink, fontVariantNumeric: "tabular-nums" }}>
        {n}
      </output>
      <button type="button" aria-label={t("more")} disabled={n >= max} onClick={() => onChange(Math.min(max, n + 1))} style={btn(n >= max)}>
        <Icon name="plus" size={26} stroke={2} />
      </button>
    </div>
  );
}
