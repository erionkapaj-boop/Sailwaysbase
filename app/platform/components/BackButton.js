"use client";
import Link from "next/link";
import { colors } from "../../../lib/platform/theme";

// One back affordance, used everywhere a screen needs to say "go back a
// step" — a page returning to where it came from, a sheet closing, a wizard
// stepping back. Before this, every place invented its own version: plain
// underlined text here, a bare unstyled button there, sometimes with a
// destination spelled out ("Πίσω στον πίνακα"), sometimes not, sitting
// wherever that screen happened to put it. One shape, one size, one place
// (top-left of whatever it's in) removes all of that guessing.
//
// Icon-only on purpose — a "←" next to a sentence-length destination read
// as more like a text link than a real, tappable control (the reported
// complaint: "moiazei me to klasiko pou exoun polles efarmoges"). A round
// chevron button is the shape people already know from every native app.
const size = 36;

const shellStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: size,
  height: size,
  borderRadius: "50%",
  border: `1px solid ${colors.border}`,
  background: colors.card,
  color: colors.ink,
  cursor: "pointer",
  flexShrink: 0,
  textDecoration: "none",
};

function ChevronLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

// Pass exactly one of `href` (real navigation, e.g. back to a dashboard) or
// `onClick` (an in-place action, e.g. closing a sheet or stepping back a
// wizard stage) — never both.
export default function BackButton({ href, onClick, label = "Πίσω", style }) {
  if (href) {
    return (
      <Link href={href} aria-label={label} style={{ ...shellStyle, ...style }}>
        <ChevronLeft />
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} style={{ ...shellStyle, ...style }}>
      <ChevronLeft />
    </button>
  );
}
