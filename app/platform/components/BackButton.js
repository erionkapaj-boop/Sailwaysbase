"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { colors } from "../../../lib/platform/theme";
import { useHeaderBack } from "./HeaderBack";
import { backShell } from "./HeaderBackSlot";
import Icon from "./Icon";

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
export default function BackButton({ href, onClick, label, style }) {
  const t = useTranslations("BackButton");
  const hb = useHeaderBack();
  const register = hb?.register;
  useEffect(() => (register ? register() : undefined), [register]);
  label = label ?? t("back");
  // Με διαθέσιμη υποδοχή στην κεφαλίδα το κουμπί εμφανίζεται εκεί (ίδια θέση σε
  // κάθε οθόνη)· αλλιώς μένει στη θέση του μέσα στη σελίδα.
  const slot = hb?.slot;
  const el = href ? (
    <Link href={href} aria-label={label} style={slot ? backShell : { ...shellStyle, ...style }}>
      {slot ? <Icon name="back" size={22} /> : <ChevronLeft />}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} style={slot ? backShell : { ...shellStyle, ...style }}>
      {slot ? <Icon name="back" size={22} /> : <ChevronLeft />}
    </button>
  );
  return slot ? createPortal(el, slot) : el;
}
