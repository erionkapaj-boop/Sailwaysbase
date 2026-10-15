"use client";
import { useTranslations } from "next-intl";
import { CABIN_KINDS } from "../../../lib/platform/cabin";
import { colors, radius } from "../../../lib/platform/theme";
import Icon, { CABIN_ICON } from "./Icon";

// Τρεις επιλογές καμπίνας σε κουτιά με εικονίδιο. onChange(kind). compact: για τα φίλτρα αποτελεσμάτων.
export default function CabinChoice({ value, onChange, compact = false, invalid = false }) {
  const t = useTranslations("Cabin");
  return (
    <div data-cabin-choice style={{ display: "grid", gridTemplateColumns: compact ? "repeat(3, 1fr)" : "1fr", gap: compact ? 8 : 12 }}>
      {CABIN_KINDS.map((k) => {
        const on = value === k;
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(k)}
            style={{
              display: "flex", flexDirection: compact ? "column" : "row", alignItems: "center", justifyContent: compact ? "center" : "flex-start",
              gap: compact ? 6 : 16, minHeight: compact ? 76 : 84, padding: compact ? "10px 6px" : "16px 20px", borderRadius: radius.md,
              fontFamily: "inherit", fontSize: compact ? 13.5 : 16.5, fontWeight: 500, cursor: "pointer", textAlign: compact ? "center" : "left",
              border: `${on ? 2 : 1}px solid ${on ? colors.ink : invalid ? colors.danger : colors.border}`,
              background: on ? colors.seaGlass : colors.card, color: colors.ink,
            }}
          >
            <Icon name={CABIN_ICON[k]} size={compact ? 26 : 34} stroke={1.4} />
            <span style={{ flex: compact ? undefined : 1 }}>{t(k)}</span>
            {!compact && on && <Icon name="check" size={20} stroke={2.2} />}
          </button>
        );
      })}
    </div>
  );
}
