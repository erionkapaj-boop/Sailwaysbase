"use client";
import { useState } from "react";
import Link from "next/link";
import { colors, fontSans, shadow, radius } from "../../../lib/platform/theme";

const itemStyle = {
  display: "block",
  padding: "12px 14px",
  fontSize: 14,
  fontFamily: fontSans,
  color: colors.ink,
  textDecoration: "none",
};

// Justified as a hamburger now that it hides more than one thing (dashboard,
// profile, logout) — a single-item menu was the problem before, not the
// hamburger shape itself.
export default function SkipperMenu({ onSignOut }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="Μενού"
        onClick={() => setOpen((o) => !o)}
        style={{ background: "none", border: "none", cursor: "pointer", padding: "6px 6px", fontSize: 19, lineHeight: 1, color: colors.ink }}
      >
        ≡
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 29 }} />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 6px)",
              background: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              minWidth: 190,
              boxShadow: shadow.raised,
              zIndex: 30,
              overflow: "hidden",
            }}
          >
            <Link href="/platform" onClick={() => setOpen(false)} style={itemStyle}>
              Αρχική
            </Link>
            <Link href="/platform/skipper" onClick={() => setOpen(false)} style={{ ...itemStyle, borderTop: `1px solid ${colors.border}` }}>
              Ο πίνακάς μου
            </Link>
            <Link href="/platform/skipper/profile" onClick={() => setOpen(false)} style={itemStyle}>
              Το προφίλ μου
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              style={{ ...itemStyle, width: "100%", textAlign: "left", background: "none", border: "none", borderTop: `1px solid ${colors.border}`, cursor: "pointer" }}
            >
              Logout
            </button>
          </div>
        </>
      )}
    </div>
  );
}
