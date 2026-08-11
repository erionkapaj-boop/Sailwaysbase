// Shared inline-style tokens for the /platform section only.
// Kept separate from components/App.jsx's own styling on purpose.
//
// Design direction: calm, modern, trust-first utility — closer to Apple/Google
// product UI than a themed "nautical" look. Light type weights, generous
// whitespace, soft elevation instead of hard borders, one restrained accent
// reserved specifically for trust/confirmation signals (not general branding).
//
// Same exported names/shapes as before (colors, page, container, card, h1, h2,
// muted, button, input, label, badge, nav) — every existing component keeps
// working unchanged. New optional tokens (radius, shadow, fontMono, money)
// can be adopted page by page.

export const colors = {
  bg: "#FAFAFA",
  card: "#FFFFFF",
  ink: "#16181D",
  inkSoft: "#6B6F76",
  brand: "#16181D",
  brandDark: "#000000",
  border: "#E4E4E7",
  danger: "#B3261E",
  success: "#1F6F52",
  warn: "#B45309",
  accent: "#1F6F52", // reserved for trust/confirmation signals only — never decorative
};

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const shadow = {
  card: "0 1px 2px rgba(16,17,20,0.04), 0 8px 24px rgba(16,17,20,0.06)",
  raised: "0 2px 4px rgba(16,17,20,0.06), 0 16px 32px rgba(16,17,20,0.10)",
};

// Fonts are loaded once in app/platform/layout.js, which defines these two
// custom properties. The brief specified Geist, but Geist has no Greek
// glyphs — mid-word fallback made Greek text render inconsistently — so the
// actual families are Inter (sans) and IBM Plex Mono (mono), both with full
// Greek coverage and the same calm neo-grotesque character.
export const fontMono =
  "var(--font-platform-mono, 'SF Mono', 'IBM Plex Mono', monospace)";

export const page = {
  minHeight: "100vh",
  background: colors.bg,
  color: colors.ink,
  fontFamily:
    "var(--font-platform-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)",
  fontWeight: 400,
};

export const container = {
  maxWidth: 960,
  margin: "0 auto",
  padding: "32px 20px 72px",
};

export const card = {
  background: colors.card,
  borderRadius: radius.lg,
  padding: 22,
  marginBottom: 16,
  boxShadow: shadow.card,
};

export const h1 = { fontSize: 28, fontWeight: 600, margin: "0 0 8px", letterSpacing: "-0.02em" };
export const h2 = { fontSize: 18, fontWeight: 600, margin: "0 0 12px", letterSpacing: "-0.01em" };
export const muted = { color: colors.inkSoft, fontSize: 14, fontWeight: 400 };

export const button = (variant = "primary") => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "10px 18px",
  borderRadius: radius.md,
  fontSize: 14,
  fontWeight: variant === "primary" ? 600 : 500,
  cursor: "pointer",
  transition: "background 0.15s ease, box-shadow 0.15s ease",
  border: variant === "primary" ? "none" : `1px solid ${colors.border}`,
  background: variant === "primary" ? colors.ink : variant === "danger" ? "#FBEAE8" : "#fff",
  color: variant === "primary" ? "#fff" : variant === "danger" ? colors.danger : colors.ink,
});

export const input = {
  width: "100%",
  padding: "10px 13px",
  borderRadius: radius.md,
  border: `1px solid ${colors.border}`,
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box",
  outlineOffset: 2,
};

export const label = {
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 6,
  display: "block",
  color: colors.inkSoft,
};

export const badge = (tone = "neutral") => {
  const tones = {
    neutral: { bg: "#F4F4F5", fg: colors.inkSoft },
    brand: { bg: "#F0F0F1", fg: colors.ink },
    success: { bg: "#E9F4EF", fg: colors.success },
    warn: { bg: "#FCF1E3", fg: colors.warn },
    danger: { bg: "#FBEAE8", fg: colors.danger },
  };
  const t = tones[tone] || tones.neutral;
  return {
    display: "inline-block",
    fontSize: 12,
    fontWeight: 600,
    padding: "3px 10px",
    borderRadius: radius.pill,
    background: t.bg,
    color: t.fg,
    fontFamily: fontMono,
    letterSpacing: "0.01em",
  };
};

// The one deliberate signature: every price / date / rating figure reads like
// a calm, precise receipt line — never decorative. Use on prices, dates,
// license numbers, ratings.
export const money = {
  fontFamily: fontMono,
  fontWeight: 500,
  fontVariantNumeric: "tabular-nums",
};

export const nav = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  padding: "14px 20px",
  borderBottom: `1px solid ${colors.border}`,
  background: "rgba(255,255,255,0.85)",
  backdropFilter: "blur(8px)",
  position: "sticky",
  top: 0,
  zIndex: 10,
};
