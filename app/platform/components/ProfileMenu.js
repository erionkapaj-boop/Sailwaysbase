"use client";
import { useState } from "react";
import Link from "next/link";
import { colors, fontSans, shadow, radius } from "../../../lib/platform/theme";

// Profile lives behind this hamburger rather than in the dashboard body
// (dashboard v2 §3): it's filled in once and rarely touched, so it shouldn't
// compete with the daily-work sections for space. The dot is the only
// leftover signal that something needs attention.
export default function ProfileMenu({ profile }) {
  const [open, setOpen] = useState(false);
  const incomplete = Boolean(profile) && (!profile.full_name || !profile.photo_url || !profile.price_per_day);

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="Μενού προφίλ"
        onClick={() => setOpen((o) => !o)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "6px 6px",
          fontSize: 19,
          lineHeight: 1,
          color: colors.ink,
          position: "relative",
        }}
      >
        ≡
        {incomplete && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 4,
              right: 2,
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: colors.warn,
            }}
          />
        )}
      </button>

      {open && (
        <>
          {/* Click-outside catcher — sits under the menu, above everything else. */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 29 }}
          />
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
            <Link
              href="/platform/skipper/profile"
              onClick={() => setOpen(false)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "12px 14px",
                fontSize: 14,
                fontFamily: fontSans,
                color: colors.ink,
                textDecoration: "none",
              }}
            >
              Το προφίλ μου
              {incomplete && <span style={{ fontSize: 11, color: colors.warn }}>Ημιτελές</span>}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
