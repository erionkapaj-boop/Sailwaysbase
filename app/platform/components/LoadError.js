"use client";
import { useTranslations } from "next-intl";
import { colors, button } from "../../../lib/platform/theme";

// What a list shows when it could not be loaded — instead of looking empty.
// An empty wallet history or inbox reads as "nothing happened", which is the
// wrong thing to tell someone when the truth is "we couldn't check".
export default function LoadError({ onRetry, what, compact = false }) {
  const t = useTranslations("LoadError");
  return (
    <div
      role="alert"
      style={{
        padding: compact ? 14 : 16,
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
        background: "#FBF4F3",
        fontSize: 14,
        display: "flex",
        gap: 12,
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
      }}
    >
      <span style={{ color: colors.danger }}>{t("message", { what: what ?? t("whatDefault") })}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} style={button("secondary")}>
          {t("retry")}
        </button>
      )}
    </div>
  );
}
