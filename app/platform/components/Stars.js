"use client";
import { colors, money } from "../../../lib/platform/theme";

function StarRow({ size, color }) {
  return (
    <span style={{ display: "flex", gap: 1, color }} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ display: "block", flexShrink: 0 }}>
          <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.44l-5.81 3.06 1.11-6.47-4.7-4.58 6.5-.95L12 2.6z" />
        </svg>
      ))}
    </span>
  );
}

// Google-style row: five stars, filled left-to-right in proportion to the
// score, then the number and how many reviews it rests on. The count is not
// decoration — 5.0 from one review and 5.0 from two hundred are very
// different claims, and the row should let someone tell them apart.
export default function Stars({ rating, count = 0, size = 15, showEmptyLabel = true }) {
  const value = count > 0 && rating != null ? Number(rating) : 0;
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
      <span style={{ position: "relative", display: "inline-flex", lineHeight: 0 }}>
        <StarRow size={size} color={colors.border} />
        {/* Overlaid and clipped rather than rounded to whole stars, so 4.3
            reads as 4.3 instead of being flattened to 4. */}
        <span
          style={{
            position: "absolute",
            inset: 0,
            width: `${pct}%`,
            overflow: "hidden",
            display: "inline-flex",
            lineHeight: 0,
          }}
        >
          <StarRow size={size} color={colors.accent} />
        </span>
      </span>

      {count > 0 ? (
        <span style={{ fontSize: 13, color: colors.inkSoft }}>
          <b style={{ ...money, color: colors.ink, fontWeight: 600 }}>{value.toFixed(1)}</b>
          {" / 5 · "}
          <span style={money}>{count}</span>
          {count === 1 ? " αξιολόγηση" : " αξιολογήσεις"}
        </span>
      ) : (
        showEmptyLabel && <span style={{ fontSize: 13, color: colors.inkSoft }}>Καμία αξιολόγηση ακόμα</span>
      )}
    </span>
  );
}
