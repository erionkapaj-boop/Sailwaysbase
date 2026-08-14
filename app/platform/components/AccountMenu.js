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

// One menu for every signed-in account. The items differ by role, the shape
// does not — a client shouldn't have to learn a different header from a
// professional just because they have fewer things in it.
export default function AccountMenu({ items = [], onSignOut }) {
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
              left: 0,
              top: "calc(100% + 6px)",
              background: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              minWidth: 200,
              boxShadow: shadow.raised,
              zIndex: 30,
              overflow: "hidden",
            }}
          >
            {items.map((it, i) => (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                style={{ ...itemStyle, borderTop: i > 0 && it.group ? `1px solid ${colors.border}` : undefined }}
              >
                {it.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              style={{
                ...itemStyle,
                width: "100%",
                textAlign: "left",
                background: "none",
                border: "none",
                borderTop: `1px solid ${colors.border}`,
                cursor: "pointer",
              }}
            >
              Logout
            </button>
          </div>
        </>
      )}
    </div>
  );
}
