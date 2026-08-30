// Shared inline-style tokens for the /platform section only.
// Kept separate from components/App.jsx's own styling on purpose.
//
// Direction (SkipperFinder landing brief §5): clean, spare, premium — a calm,
// refined nod to the sea rather than a literal one. Warm paper background,
// deep navy ink, hairline borders, an elegant serif for headings against a
// plain sans for UI, and a sand accent used at most once per screen.

export const colors = {
  bg: "#FCFBF9", // near-white with the faintest warmth — was #FAF8F4, read as a
  // flat, heavy beige once every screen used it; this keeps the paper feel
  // without the whole app reading as one shade of cream.
  card: "#FFFFFF",
  ink: "#16283C", // deep navy-ink, same family as the logo navy
  inkSoft: "#6D7F91", // soft grey-blue for labels and secondary text
  brand: "#16283C",
  brandDark: "#0E1B29",
  border: "#E9E5DD", // hairline, warm grey — never heavy
  danger: "#A63A2E",
  success: "#2F6B54",
  warn: "#9A6B22",
  accent: "#C3A164", // sand/gold — sparingly, one place at a time, never decorative
  seaGlass: "#EFF3F2", // barely-there hover/selected tint; must not read as "sea blue"
};

export const radius = { sm: 6, md: 10, lg: 14, pill: 999 };

export const shadow = {
  card: "0 1px 2px rgba(22,40,60,0.03), 0 8px 24px rgba(22,40,60,0.05)",
  raised: "0 2px 4px rgba(22,40,60,0.05), 0 16px 32px rgba(22,40,60,0.08)",
};

// Loaded in app/platform/layout.js. All three carry Greek glyphs — a
// requirement that has already bitten us once (Geist has none, and Greek text
// fell back per-character mid-word).
export const fontSerif =
  "var(--font-platform-serif, Georgia, 'Times New Roman', serif)";
export const fontSans =
  "var(--font-platform-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)";
export const fontMono =
  "var(--font-platform-mono, 'SF Mono', 'IBM Plex Mono', monospace)";

export const page = {
  minHeight: "100vh",
  background: colors.bg,
  color: colors.ink,
  fontFamily: fontSans,
  fontWeight: 400,
};

export const container = {
  maxWidth: 960,
  margin: "0 auto",
  padding: "32px 20px 72px",
};

export const card = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.lg,
  padding: 22,
  marginBottom: 16,
};

// Headings use the sans, not the serif — EB Garamond's Greek glyphs read as
// dated/classical rather than premium (Latin text in the same face, e.g. the
// wordmark, doesn't have this problem — it's a Greek-specific rendering
// issue). fontSerif is kept for that Latin wordmark only now; every other
// heading is one typeface, differentiated by weight/size, which is also
// just a more minimal system than a serif/sans pairing.
export const h1 = {
  fontFamily: fontSans,
  fontSize: 28,
  fontWeight: 600,
  margin: "0 0 8px",
  letterSpacing: "-0.015em",
  lineHeight: 1.2,
};
export const h2 = {
  fontFamily: fontSans,
  fontSize: 18,
  fontWeight: 600,
  margin: "0 0 12px",
  letterSpacing: "-0.01em",
};
export const muted = { color: colors.inkSoft, fontSize: 14, fontWeight: 400 };

export const button = (variant = "primary") => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "10px 18px",
  borderRadius: radius.md,
  fontSize: 14,
  fontWeight: variant === "primary" ? 500 : 400,
  fontFamily: fontSans,
  cursor: "pointer",
  transition: "background 0.18s ease, border-color 0.18s ease, color 0.18s ease",
  border: variant === "primary" ? "1px solid transparent" : `1px solid ${colors.border}`,
  background: variant === "primary" ? colors.ink : variant === "danger" ? "#F7EDEB" : "transparent",
  color: variant === "primary" ? "#fff" : variant === "danger" ? colors.danger : colors.ink,
});

export const input = {
  width: "100%",
  padding: "11px 13px",
  borderRadius: radius.md,
  border: `1px solid ${colors.border}`,
  background: colors.card,
  fontSize: 15,
  fontFamily: "inherit",
  color: colors.ink,
  boxSizing: "border-box",
  outlineOffset: 2,
};

// A native <select>, restyled to match every other form control instead of
// showing raw per-browser OS chrome (the one concrete "looks unfinished"
// complaint that repeated across every page with a dropdown). Stays a real
// <select> — appearance:none only removes the default arrow, which is
// redrawn by hand in the same ink used everywhere else; keyboard and mobile
// behaviour are untouched.
export const select = {
  ...input,
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  paddingRight: 34,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='${colors.inkSoft.replace(
    "#",
    "%23"
  )}' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 13px center",
  cursor: "pointer",
};

export const label = {
  fontSize: 13,
  fontWeight: 400,
  marginBottom: 8,
  display: "block",
  color: colors.inkSoft,
};

export const badge = (tone = "neutral") => {
  const tones = {
    neutral: { bg: "#F0F2F3", fg: colors.inkSoft }, // cool light grey, not another beige
    brand: { bg: "#EDF1F3", fg: colors.ink },
    success: { bg: "#EAF2EE", fg: colors.success },
    warn: { bg: "#F7F0E2", fg: colors.warn },
    danger: { bg: "#F7EDEB", fg: colors.danger },
  };
  const t = tones[tone] || tones.neutral;
  return {
    display: "inline-block",
    fontSize: 12,
    fontWeight: 500,
    padding: "3px 10px",
    borderRadius: radius.pill,
    background: t.bg,
    color: t.fg,
    fontFamily: fontMono,
    letterSpacing: "0.01em",
  };
};

// Every price / date / rating figure reads like a calm, precise receipt line.
export const money = {
  fontFamily: fontMono,
  fontWeight: 400,
  fontVariantNumeric: "tabular-nums",
};

// Small caps-style label for section headers everywhere except the page
// title and the calendar month — those two keep the serif (dashboard v2
// style guide §4): the rest of the UI should read as quiet sans-serif, not
// a stack of equally-loud editorial headings.
export const sectionLabel = {
  fontFamily: fontSans,
  fontSize: 12,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: colors.inkSoft,
  margin: "0 0 12px",
};

// Availability calendar day states — warm sand for declared availability,
// solid navy for a locked-in confirmed booking. Deliberately not
// traffic-light red/green/orange, which would clash with the rest of the
// palette and read as an alert rather than a status.
export const calendarDay = {
  available: { bg: "rgba(195,161,100,0.18)", fg: colors.ink },
  booked: { bg: colors.ink, fg: "#FFFFFF" },
  // Closed by the professional (holiday, personal). Reads as "switched off"
  // rather than "taken" — no colour of its own, just drained.
  blocked: { bg: "#EDEAE4", fg: colors.inkSoft },
};

export const nav = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  padding: "14px 20px",
  borderBottom: `1px solid ${colors.border}`,
  background: "rgba(252,251,249,0.85)",
  backdropFilter: "blur(8px)",
  position: "sticky",
  top: 0,
  zIndex: 10,
};
