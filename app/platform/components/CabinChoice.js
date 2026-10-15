"use client";
import { useTranslations } from "next-intl";
import { CABIN_CHOICES } from "../../../lib/platform/cabin";
import { colors, radius } from "../../../lib/platform/theme";
import Icon, { CABIN_ICON } from "./Icon";

// Οι τρεις επιλογές καμπίνας και «Δεν ξέρω ακόμα» σε κουτιά με εικονίδιο. onChange(kind). compact: για τα φίλτρα αποτελεσμάτων.
export default function CabinChoice({ value, onChange, compact = false, invalid = false }) {
  const t = useTranslations("Cabin");
  return (
    <div data-cabin-choice style={{ display: "grid", gridTemplateColumns: compact ? "repeat(2, 1fr)" : "1fr", gap: compact ? 8 : 12 }}>
      {CABIN_CHOICES.map((k) => {
        const on = value === k;
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(k)}
            style={{
              display: "flex", flexDirection: compact ? "column" : "row", alignItems: "center", justifyContent: compact ? "center" : "flex-start",
              gap: compact ? 6 : 16, minHeight: compact ? 84 : 96, padding: compact ? "10px 6px" : "16px 20px", borderRadius: radius.md,
              fontFamily: "inherit", fontSize: compact ? 13.5 : 16.5, fontWeight: 500, cursor: "pointer", textAlign: compact ? "center" : "left",
              border: `${on ? 2 : 1}px solid ${on ? colors.ink : invalid ? colors.danger : colors.border}`,
              background: on ? colors.seaGlass : colors.card, color: colors.ink,
            }}
          >
            <span style={{ width: compact ? 30 : 52, display: "inline-flex", justifyContent: "center", flexShrink: 0 }}>
              <Icon name={CABIN_ICON[k]} size={compact ? 30 : 52} stroke={1.3} />
            </span>
            <span style={{ flex: compact ? undefined : 1 }}>{t(k)}</span>
            {!compact && on && <Icon name="check" size={20} stroke={2.2} />}
          </button>
        );
      })}
    </div>
  );
}
