"use client";
import { colors } from "../../../lib/platform/theme";

// Shared shell for the header's icon buttons (requests bell, messages
// envelope) — same drawn-outline, same small red count, so adding a second
// one next to the first reads as one family instead of two different styles.
export default function IconBadgeButton({ icon, count = 0, onClick, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count > 0 ? `${ariaLabel} (${count})` : ariaLabel}
      style={{
        position: "relative",
        display: "flex",
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "6px 6px",
        color: colors.ink,
      }}
    >
      {icon}
      {count > 0 && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -1,
            right: -1,
            minWidth: 14,
            height: 14,
            padding: "0 3px",
            borderRadius: "50%",
            background: colors.danger,
            color: "#fff",
            fontSize: 9,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
          }}
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}
