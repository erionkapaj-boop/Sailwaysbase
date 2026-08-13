"use client";
import { useState } from "react";
import { card, h2, muted, colors, badge } from "../../../lib/platform/theme";

// Section that starts closed so long forms don't push the things a
// professional actually opens the app for below the fold.
export default function Collapsible({ title, subtitle, badgeText, badgeTone = "warn", defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "18px 22px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "inherit",
        }}
      >
        <span>
          <span style={{ ...h2, fontSize: 17, margin: 0, display: "block" }}>{title}</span>
          {subtitle && <span style={{ ...muted, fontSize: 13, display: "block", marginTop: 4 }}>{subtitle}</span>}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {badgeText && <span style={badge(badgeTone)}>{badgeText}</span>}
          <span
            style={{
              color: colors.inkSoft,
              fontSize: 18,
              lineHeight: 1,
              transform: open ? "rotate(180deg)" : "none",
              transition: "transform 0.2s ease",
            }}
            aria-hidden="true"
          >
            ⌄
          </span>
        </span>
      </button>

      {open && <div style={{ padding: "0 22px 22px" }}>{children}</div>}
    </div>
  );
}
